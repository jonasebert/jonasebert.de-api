import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handle } from 'hono/vercel'

// For calendar
import pkg_ical from 'node-ical';
import pkg_rrule from 'rrule';
const { parseICS } = pkg_ical;
const { RRule, RRuleSet, rrulestr } = pkg_rrule;

// Blog
import * as prismic from '@prismicio/client'

const app = new Hono().basePath('/api')

app.use(
  '/',
  cors({
    origin: ['*'],
    allowHeaders: ['Upgrade-Insecure-Requests'],
    allowMethods: ['GET', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true
  })
)

app.get('/', async (c) => {
  c.header('Access-Control-Allow-Origin', '*');

  const type = c.req.queries('type')?.shift()
  let posts
  let resp
  switch (type) {
    case 'blog':
      const maxItems = c.req.queries('maxitems')?.shift() || '30'
      const itemType = c.req.queries('itemtype')?.shift()

      const prismicClient = prismic.createClient('jonasebert', {
        routes: [
          { type: 'article', path: '/blog/:uid' },
        ],
        fetch: fetch
      })

      try {
        switch (itemType) {
          case 'all':
            resp = await prismicClient.getByType('article', { orderings: { field: 'document.first_publication_date', direction: 'desc' }, pageSize: maxItems})
            posts = resp.results
            break;

          case 'category':
            const category = c.req.queries('category')?.shift()
            resp = await prismicClient.getByTag(category, { orderings: { field: 'document.first_publication_date', direction: 'desc' }, pageSize: maxItems})
            posts = resp.results
            break;

          case 'post':
            const postId = c.req.queries('postid')?.shift()
            resp = await prismicClient.getByUID('article', postId,)
            posts = resp
            break;

          default:
            console.error('Invalid itemType')
            return new Response(undefined, { status: 400, statusText: 'Invalid Item Type'});
            posts = [];
          }

        return c.json({
          input: {
            maxItems, itemType
          },
          data: posts
        })
      } catch (error) {
        console.error(error)
        return new Response(undefined, { status: 500, statusText: 'An error occured'});
      }
      break;

    case 'calendar':
      const icalUrl = 'https://cloud.jonasebert.de/remote.php/dav/public-calendars/bn8yfoyg8GEQ6TNN?export';
      const now = new Date();
      const later = new Date(now.getFullYear(), now.getMonth()+3, now.getDate()+1);
      const calMaxItems = c.req.queries('maxItems')?.shift() || '93';

      try {
        resp = await fetch(icalUrl, {
          headers: {
            'User-Agent': 'Jonas Ebert/1.0'
          }
        });
        const respText = await resp.text();
        const data = parseICS(respText);
        let events = [];

        // Handle (recurrend) events
        for (const event of Object.values(data)) {
          if (event.type === 'VEVENT') {
              let occurrences = [];
              if (event.rrule) {
                  const rule = rrulestr(event.rrule.toString(), { dtstart: event.start });
                  occurrences = rule.between(now, later, true).map(date => ({
                      ...event,
                      start: date,
                      end: new Date(date.getTime() + (event.end - event.start))
                  }));
              } else if ((event.start >= now && event.start <= later) || (event.end >= now && event.end <= later)) {
                  occurrences.push(event);
              }
              events.push(...occurrences);
          }
        }
        // Sort events
        events = events.sort((a, b) => new Date(a.start) - new Date(b.start));
        // Slice events
        events = events.slice(0, calMaxItems);
        // Customize events
        events = events.map(event => {
          // Extrahieren der Teaserbild-ID aus der Beschreibung
          const teaserImageMatch = event.description?.match(/^teaserimage:\s*(\S+)/);
          const teaserImageId = teaserImageMatch ? teaserImageMatch[1] : null;
          const teaserImageUrl = teaserImageId ? `https://cloud.jonasebert.de/index.php/apps/files_sharing/publicpreview/${teaserImageId}?x=3440&y=1440&a=true` : null;
          let happeningnow;

          // Check if event is happening now
          if (event.start <= now && event.end >= now) {
            happeningnow = true;
          } else {
            happeningnow = false;
          }

          // Return to client
          return {
              start: event.start ? event.start : null,
              end: event.end ? event.end : null,
              now: happeningnow ? happeningnow : false,
              datetype: event.datetype ? event.datetype : null,
              summary: event.summary ? event.summary : null,
              location: event.location ? event.location : null,
              description: event.description ? event.description.replace(/^teaserimage:\s*\S+\n?/, '') : null,
              state: event.status ? event.status : "TENTATIVE",
              teaserImage: teaserImageUrl,
          }
        });

        return c.json({
          data: events,
        });
      } catch {
        return c.json({
          error: 'Failed to fetch or parse ICS file',
          debug: {}
        }, 500);
      }
      break;
  
    default:
      console.error('Invalid Type')
      return new Response(undefined, { status: 400, statusText: 'Ungültiger Typ-Parameter'});
  }
})

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const OPTIONS = handler;
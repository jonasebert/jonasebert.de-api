// Basics
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handle } from 'hono/vercel'

// For Blog
import * as prismic from '@prismicio/client'

// For calendar
import pkg_ical from 'node-ical';
import pkg_rrule from 'rrule';
const { parseICS } = pkg_ical;
const { RRule, RRuleSet, rrulestr } = pkg_rrule;

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

  switch (type) {
    case 'blog':
      let blogPosts = [];
      let blogResp = [];

      const blogMaxItems = c.req.queries('maxitems')?.shift() || '30'
      const blogItemType = c.req.queries('itemtype')?.shift()

      const prismicClient = prismic.createClient('jonasebert', {
        routes: [
          { type: 'article', path: '/blog/:uid' },
        ],
        fetch: fetch
      })

      try {
        switch (blogItemType) {
          case 'all':
            blogResp = await prismicClient.getByType('article', { orderings: { field: 'document.first_publication_date', direction: 'desc' }, pageSize: blogMaxItems});
            blogPosts = blogResp.results;
            break;

          case 'category':
            const blogCategory = c.req.queries('category')?.shift();
            blogResp = await prismicClient.getByTag(blogCategory, { orderings: { field: 'document.first_publication_date', direction: 'desc' }, pageSize: blogMaxItems});
            blogPosts = blogResp.results;
            break;

          case 'post':
            const blogPostId = c.req.queries('postid')?.shift();
            blogResp = await prismicClient.getByUID('article', blogPostId,);
            blogPosts = blogResp;
            break;

          default:
            console.error(`Invalid ItemType: ${c.req.queries('itemtype')?.shift() || null}`);
            return c.json({
              error: 'Invalid or missing ItemType parameter',
              debug: {
                type: c.req.queries('itemtype')?.shift() || null
              }
            }, 500);
          }

        return c.json({
          data: blogPosts
        });
      } catch (error) {
        console.error(error);
        return c.json({
          error: 'An error occured',
          debug: {
            error: null
          }
        }, 500);
      }
      break;

    case 'calendar':
      const calIcalUrl = 'https://cloud.jonasebert.de/remote.php/dav/public-calendars/bn8yfoyg8GEQ6TNN?export';
      const calNow = new Date();
      const calLater = new Date(calNow.getFullYear(), calNow.getMonth()+3, calNow.getDate()+1);
      const calMaxItems = c.req.queries('maxitems')?.shift() || '93';

      let calResp = [];

      try {
        calResp = await fetch(calIcalUrl, {
          headers: {
            'User-Agent': 'Jonas Ebert/1.0'
          }
        });
        const calRespText = await calResp.text();
        const calData = parseICS(calRespText);
        let calEvents = [];

        // Handle (recurrend) events
        for (const calEvent of Object.values(calData)) {
          if (calEvent.type === 'VEVENT') {
              let calOccurrences = [];
              if (calEvent.rrule) {
                  const calRule = rrulestr(calEvent.rrule.toString(), { dtstart: calEvent.start });
                  calOccurrences = calRule.between(calNow, calLater, true).map(calDate => ({
                      ...calEvent,
                      start: calData,
                      end: new Date(calData.getTime() + (calEvent.end - calEvent.start))
                  }));
              } else if ((calEvent.start >= calNow && calEvent.start <= calLater) || (calEvent.end >= calNow && calEvent.end <= calLater)) {
                  calOccurrences.push(calEvent);
              }
              calEvents.push(...calOccurrences);
          }
        }
        // Sort events
        calEvents = calEvents.sort((a, b) => new Date(a.start) - new Date(b.start));

        // Calendar cases
        try {
          const calItemType = c.req.queries('itemtype')?.shift() || 'all';

          switch (calItemType) {
            case 'all': break;

            case 'single':
              const calSingleItemUID = c.req.queries('id')?.shift();

              if (calSingleItemUID || calSingleItemUID != '') {
                calEvents = calEvents.filter(uid == calSingleItemUID);
              } else {
                return c.json({
                  error: 'Missing id for single event',
                  debug: {data: calEvents}
                }, 500);
              }
              break;

            default:
          }
        } catch {
          return c.json({
            error: 'Failed to fetch or parse ICS file',
            debug: {data: calEvents}
          }, 500);
        }

        // Slice events
        calEvents = calEvents.slice(0, calMaxItems);
        // Customize events
        calEvents = calEvents.map(calEvent => {
          // Extrahieren der Teaserbild-ID aus der Beschreibung
          const calTeaserImageMatch = calEvent.description?.match(/teaserimage:\s*(\S+)/);
          const calTeaserImageId = calTeaserImageMatch ? calTeaserImageMatch[1] : null;
          const calTeaserImageUrl = calTeaserImageId ? `https://cloud.jonasebert.de/index.php/apps/files_sharing/publicpreview/${calTeaserImageId}?x=3440&y=1440&a=true` : null;

          // Extrahieren der externen Event URL
          const calEventUrlMatch = calEvent.description?.match(/eventurl:\s*(\S+)/);
          const calEventUrl = calEventUrlMatch ? calEventUrlMatch[1] : null;

          // Check if event is happening now
          let calHappeningNow = false;
          if (calEvent.start <= calNow && calEvent.end >= calNow) {
            calHappeningNow = true;
          }

          // Return to client
          return {
            id: calEvent.uid ? calEvent.uid : null,
            start: calEvent.start ? calEvent.start : null,
            end: calEvent.end ? calEvent.end : null,
            now: calHappeningNow ? calHappeningNow : false,
            datetype: calEvent.datetype ? calEvent.datetype : null,
            summary: calEvent.summary ? calEvent.summary : null,
            location: calEvent.location ? calEvent.location : null,
            description: calEvent.description ? calEvent.description.replace(/teaserimage:\s*\S+\n?/, '').replace(/eventurl:\s*\S+\n?/, '') : null,
            state: calEvent.status ? calEvent.status : "TENTATIVE",
            teaserImage: calTeaserImageUrl ? calTeaserImageUrl : null,
            url: calEventUrl ? calEventUrl : null
          }
        });

        return c.json({
          data: calEvents
        });
      } catch {
        return c.json({
          error: 'Failed to fetch or parse ICS file',
          debug: {}
        }, 500);
      }
      break;
  
    default:
      console.error(`Invalid Type: ${c.req.queries('type')?.shift() || null}`);
      return c.json({
        error: 'Invalid or missing Type parameter',
        debug: {
          type: c.req.queries('type')?.shift() || null
        }
      }, 500);
  }
})

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const OPTIONS = handler;
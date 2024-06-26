import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { handle } from 'hono/vercel'

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
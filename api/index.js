import { Hono } from 'hono'
import { handle } from 'hono/vercel'

// Blog
import * as prismic from '@prismicio/client'

const app = new Hono().basePath('/api')

app.get('/', async (c) => {
  let type = c.req.queries('type')?.shift()

  switch (type) {
    case 'blog':
      let maxItems = c.req.queries('maxitems')?.shift()
      if (!maxItems) {
        maxItems = '30'
      }

      let itemType = c.req.queries('itemtype')?.shift()
      const prismicClient = prismic.createClient('jonasebert', {
        routes: [
          { type: 'article', path: '/blog/:uid' },
        ],
        fetch: fetch, // Wenn Ihr Code in Node.js 16 oder früher läuft, benötigen Sie eine fetch-Funktion.
      });
      const posts = await prismicClient.getByType('article', { orderings: { field: 'document.first_publication_date', direction: 'desc' }, pageSize: maxItems});

      return c.json({
        input: {
          maxItems, itemType
        },
        result: posts.results
    })
      break;
  
    default:
      return c.json({ message: "ERROR" })
      break;
  }
})

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const OPTIONS = handler;
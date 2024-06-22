import { Hono } from 'hono'
import { handle } from 'hono/vercel'

const app = new Hono().basePath('/api')

app.get('/', (c) => {
  const type = c.req.queries('type')?.shift()

  switch (type) {
    case 'blog':
      // return c.json({ message: "Congrats! BLOG" })
      const maxItems = c.req.queries('maxitems')?.shift()
      return c.json({ input: {
        maxItems
      }})
      break;
  
    default:
      return c.json({ message: "Congrats! You've deployed Hono to Vercel" })
      break;
  }
})

const handler = handle(app);

export const GET = handler;
export const POST = handler;
export const PATCH = handler;
export const PUT = handler;
export const OPTIONS = handler;
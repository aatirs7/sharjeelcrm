import { drizzle } from 'drizzle-orm/neon-http'
import { neon } from '@neondatabase/serverless'
import * as schema from './schema'

type DB = ReturnType<typeof createDb>

function createDb() {
  const url = process.env.DATABASE_URL
  if (!url) {
    // Surfaced clearly at first query rather than as an opaque driver error.
    // Deferred (not thrown at import) so `next build` can bundle without a live DB.
    throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local and fill it in.')
  }
  return drizzle(neon(url), { schema })
}

let _db: DB | undefined

// Lazy singleton: the connection is created on first query, not at import time.
export const db = new Proxy({} as DB, {
  get(_target, prop, receiver) {
    if (!_db) _db = createDb()
    return Reflect.get(_db, prop, receiver)
  },
})

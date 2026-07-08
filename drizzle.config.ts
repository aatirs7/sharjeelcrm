import { config } from 'dotenv'
import { defineConfig } from 'drizzle-kit'

// Next.js keeps secrets in .env.local; load it (falling back to .env) for CLI tools.
config({ path: '.env.local' })
config({ path: '.env' })

export default defineConfig({
  schema: './lib/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
})

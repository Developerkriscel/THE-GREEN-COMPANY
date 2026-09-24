import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

const require = createRequire(import.meta.url)
const { Client } = require('pg')
import { readFileSync } from 'fs'

// The connection string comes from .env and nowhere else. A fallback literal
// used to live here with the live database owner's password in it, which is
// how a credential ends up in a public repository.
const envRaw = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const dbUrl = envRaw.match(/^DATABASE_URL=(.+)$/m)?.[1]?.trim()
if (!dbUrl) {
  console.error('No DATABASE_URL in .env')
  process.exit(1)
}

const client = new Client({ connectionString: dbUrl })
await client.connect()

await client.query(`insert into storage.buckets (id, name, public) values ('gallery', 'gallery', true) on conflict (id) do nothing`)
console.log('gallery bucket: OK')

const r1 = await client.query('select count(*) from public.gallery_photos')
console.log('gallery_photos count:', r1.rows[0].count)

const r2 = await client.query("select value from public.site_settings where key = 'public.contact'")
console.log('contact setting:', r2.rows[0]?.value ? 'OK' : 'MISSING')

await client.end()

import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
import { readFileSync } from 'fs'

const envRaw = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const dbUrl = envRaw.match(/^DATABASE_URL=(.+)$/m)?.[1]
if (!dbUrl) throw new Error('DATABASE_URL not found in .env')

const client = new Client({ connectionString: dbUrl })
await client.connect()

const IMAGES = [
  {
    slug: 'manglam-city-block-a',
    hero_image: 'https://dvocohgawbllsboocytf.supabase.co/storage/v1/object/sign/cms-gallery/1783587757613-fjm5ea.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzNTg3NzU3NjEzLWZqbTVlYS5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzNTg3NzYwLCJleHAiOjIwOTg5NDc3NjB9.eHVtPL7zwP_oFnLyl1DrIMuQHdgAb-hf48FBA6Tl7gc',
  },
  {
    slug: 'manglam-city-block-b',
    hero_image: 'https://dvocohgawbllsboocytf.supabase.co/storage/v1/object/sign/cms-gallery/1783317491810-799v35.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMzE3NDkxODEwLTc5OXYzNS5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzE3NDk0LCJleHAiOjIwOTg2Nzc0OTR9.Cl3p1EmTTL7bS2nb61dlIZCHe9PrMEza8FdTZGea0ps',
  },
  {
    slug: 'anjani-kunj',
    hero_image: 'https://dvocohgawbllsboocytf.supabase.co/storage/v1/object/sign/cms-gallery/1783317515176-osrfrp.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMzE3NTE1MTc2LW9zcmZycC5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzE3NTE2LCJleHAiOjIwOTg2Nzc1MTZ9.yAlaYOY2HM59opm6feKQQMZj3O7wfqHk1QJrpgwj4sY',
  },
  {
    slug: 'anjani-homes',
    hero_image: 'https://dvocohgawbllsboocytf.supabase.co/storage/v1/object/sign/cms-gallery/1783586528734-uq1vpt.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzNTg2NTI4NzM0LXVxMXZwdC5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzNTg2NTMxLCJleHAiOjIwOTg5NDY1MzF9.0mjTi-FOi6tVy4U71wCRS6EUN__QWkpIyWLb55fShzg',
  },
  {
    slug: 'symo-city-ayodhya',
    hero_image: 'https://dvocohgawbllsboocytf.supabase.co/storage/v1/object/sign/cms-gallery/1783317554907-tnsyh0.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzgzMzE3NTU0OTA3LXRuc3loMC5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzgzMzE3NTU3LCJleHAiOjIwOTg2Nzc1NTd9.NHBZ-2uIC-OgNQg5E9BlWp9gTzJ2-wbeOq9ynXbvAac',
  },
  {
    slug: 'royal-green-farm',
    hero_image: 'https://dvocohgawbllsboocytf.supabase.co/storage/v1/object/sign/cms-gallery/1787565783653-2mlnix.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS8xNzg3NTY1NzgzNjUzLTJtbG5peC5qcGciLCJzY29wZSI6ImRvd25sb2FkIiwiaWF0IjoxNzg3NTY1Nzg2LCJleHAiOjIxMDI5MjU3ODZ9.7mBBTsPs_j-kH9DKDd4TN9DeYTPsmqSPxyYFhD_Lugc',
  },
]

let updated = 0
for (const { slug, hero_image } of IMAGES) {
  const result = await client.query(
    'UPDATE public.projects SET hero_image = $1, updated_at = now() WHERE slug = $2',
    [hero_image, slug]
  )
  if (result.rowCount > 0) {
    console.log(`OK  ${slug}`)
    updated++
  } else {
    console.log(`SKIP ${slug} (not found)`)
  }
}

console.log(`\nDone. Updated ${updated} projects with hero images.`)
await client.end()

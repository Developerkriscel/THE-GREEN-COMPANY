import { createRequire } from 'module'
const require = createRequire(import.meta.url)
const { Client } = require('pg')
import { readFileSync } from 'fs'

const envRaw = readFileSync(new URL('../.env', import.meta.url), 'utf8')
const dbUrl = envRaw.match(/^DATABASE_URL=(.+)$/m)?.[1]
if (!dbUrl) throw new Error('DATABASE_URL not found in .env')

const client = new Client({ connectionString: dbUrl })
await client.connect()

const PROJECTS = [
  {
    slug: 'manglam-city-block-a',
    name: 'Manglam City — Block A',
    location: 'Indri, Haryana',
    city: 'Indri',
    state: 'Haryana',
    description: 'Premium residential plots in Manglam City Block A, Indri. Title-verified layouts with wide roads and modern amenities. Booking open now.',
    amenities: ['Wide Internal Roads', 'Street Lighting', 'Park & Open Spaces', 'Water Supply', 'Boundary Wall', 'Clear Title'],
    price_from: 20000,
    size_from: 100, size_to: 500,
    size_unit: 'sqyd',
    published: true, featured: true, sort_order: 1,
  },
  {
    slug: 'manglam-city-block-b',
    name: 'Manglam City — Block B',
    location: 'Indri, Haryana',
    city: 'Indri',
    state: 'Haryana',
    description: 'Phase 2 residential plots in Manglam City Block B with affordable pricing. Ideal for investment and end-use. Booking open now.',
    amenities: ['Wide Internal Roads', 'Street Lighting', 'Park & Open Spaces', 'Water Supply', 'Boundary Wall', 'Clear Title'],
    price_from: 19000,
    size_from: 100, size_to: 500,
    size_unit: 'sqyd',
    published: true, featured: true, sort_order: 2,
  },
  {
    slug: 'anjani-kunj',
    name: 'Anjani Kunj',
    location: 'Mumbai Highway, Haryana',
    city: 'Haryana',
    state: 'Haryana',
    description: 'Residential plots along the Mumbai Highway corridor. Excellent connectivity and appreciation potential. Booking open now.',
    amenities: ['Highway Connectivity', 'Wide Roads', 'Park & Green Zones', 'Security', 'Clear Title', '24×7 Water'],
    price_from: 15000,
    size_from: 120, size_to: 600,
    size_unit: 'sqyd',
    published: true, featured: true, sort_order: 3,
  },
  {
    slug: 'anjani-homes',
    name: 'Anjani Homes',
    location: 'Bhirawati, Haryana',
    city: 'Bhirawati',
    state: 'Haryana',
    description: 'Affordable residential plots at Anjani Homes, Bhirawati. Peaceful location with all essential amenities. Booking open now.',
    amenities: ['Wide Internal Roads', 'Park & Playground', 'Water Supply', 'Electricity', 'Security', 'Clear Title'],
    price_from: 16000,
    size_from: 100, size_to: 500,
    size_unit: 'sqyd',
    published: true, featured: false, sort_order: 4,
  },
  {
    slug: 'symo-city-ayodhya',
    name: 'Symo City',
    location: 'Ayodhya, Uttar Pradesh',
    city: 'Ayodhya',
    state: 'Uttar Pradesh',
    description: 'Premium mini farmhouse plots in holy Ayodhya. Symo City blends spiritual tranquility with modern infrastructure. Pre-booking open — limited availability.',
    amenities: ['Mini Farmhouse Design', 'Gated Community', 'Temple Proximity', 'Water & Power', 'Landscaped Gardens', 'Wide Roads'],
    price_from: 15000,
    size_from: 300, size_to: 1000,
    size_unit: 'sqyd',
    published: true, featured: false, sort_order: 5,
  },
  {
    slug: 'royal-green-farm',
    name: 'The Royal Green Farm',
    location: 'Near Gurgaon Highway, Haryana',
    city: 'Gurgaon',
    state: 'Haryana',
    description: 'Farmhouse plots in a serene highway-adjacent location near Gurgaon. Ideal retreat from city life. Pre-booking open now.',
    amenities: ['Farmhouse Plots', 'Highway Access', 'Natural Surroundings', 'Borewells', 'Boundary Wall', 'Clear Title'],
    price_from: 12000,
    size_from: 300, size_to: 300,
    size_unit: 'sqyd',
    published: true, featured: false, sort_order: 6,
  },
]

let inserted = 0
let skipped = 0

for (const p of PROJECTS) {
  const exists = await client.query('SELECT 1 FROM public.projects WHERE slug = $1', [p.slug])
  if (exists.rows.length > 0) {
    console.log(`SKIP ${p.slug} (already exists)`)
    skipped++
    continue
  }

  await client.query(`
    INSERT INTO public.projects
      (slug, name, location, city, state, description, amenities, price_from, size_from, size_to, size_unit, published, featured, sort_order)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
  `, [
    p.slug, p.name, p.location, p.city, p.state, p.description,
    p.amenities, p.price_from, p.size_from, p.size_to, p.size_unit,
    p.published, p.featured, p.sort_order
  ])
  console.log(`OK  ${p.slug}`)
  inserted++
}

const count = await client.query('SELECT count(*) FROM public.projects WHERE published = true')
console.log(`\nDone. Inserted: ${inserted}, Skipped: ${skipped}. Total published: ${count.rows[0].count}`)
await client.end()

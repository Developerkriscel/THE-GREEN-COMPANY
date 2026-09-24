import { createClient } from '@supabase/supabase-js'

const envUrl = import.meta.env.VITE_SUPABASE_URL
const envAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJyb3lhbC1ncmVlbi1nYXRld2F5IiwiYXVkIjoiYXV0aGVudGljYXRlZCIsImlhdCI6MTc4OTEwODI2NCwiZXhwIjoxOTQ2Nzg4MjY0LCJyb2xlIjoiYW5vbiJ9.iGjj67zWRTHumRA0r6HlQzC3Wh2KycPagQEOfRK1x_0'

function resolveSupabaseUrl(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const host = window.location.hostname
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return window.location.origin
    }
  }
  return envUrl || 'http://localhost:54321'
}

const url = resolveSupabaseUrl()
const anonKey = envAnonKey || FALLBACK_ANON_KEY

export const isSupabaseConfigured = Boolean(url && anonKey)

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
})

/** Short-lived signed URL for a private bucket object. */
export async function signedUrl(bucket: string, path: string, seconds = 120) {
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, seconds)
  if (error) throw error
  return data.signedUrl
}

/** Open a private document in a new tab via a signed URL. */
export async function openPrivateFile(bucket: string, path: string) {
  const href = await signedUrl(bucket, path)
  window.open(href, '_blank', 'noopener')
}

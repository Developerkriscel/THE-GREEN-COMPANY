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

/*
 * One sign-in per browser TAB, not per browser.
 *
 * supabase-js keeps the session in localStorage, which every tab of the site
 * shares, and announces each sign-in to all open tabs over a BroadcastChannel.
 * So signing in as member B in a second tab silently turned the first tab --
 * still showing member A's screens -- into member B, and a reload of any tab
 * opened whoever signed in last. On a shared office or cyber-cafe computer
 * that shows one member's account to another.
 *
 * Now the session lives in sessionStorage (private to the tab, kept across a
 * reload, gone when the tab closes), under a key unique to the tab, and the
 * cross-tab channel is closed. A new tab starts signed out.
 */
function tabStorageKey(): string {
  const ID_KEY = 'symocity-tab-id'
  try {
    let id = window.sessionStorage.getItem(ID_KEY)
    if (!id) {
      id = Math.random().toString(36).slice(2, 10) + Date.now().toString(36)
      window.sessionStorage.setItem(ID_KEY, id)
    }
    return `sb-symocity-auth-${id}`
  } catch {
    return 'sb-symocity-auth'
  }
}

/** Sessions saved by older builds in the shared localStorage: drop them. */
function clearSharedSessions() {
  try {
    for (const k of Object.keys(window.localStorage)) {
      if (/^sb-.*-auth-token(-code-verifier)?$/.test(k)) window.localStorage.removeItem(k)
    }
  } catch {
    /* storage blocked: nothing shared to clear */
  }
}

const inBrowser = typeof window !== 'undefined'
if (inBrowser) clearSharedSessions()

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    ...(inBrowser ? { storage: window.sessionStorage, storageKey: tabStorageKey() } : {}),
  },
})

// A duplicated tab inherits the tab id along with the rest of sessionStorage,
// and so would share the broadcast channel named after it. Close the channel:
// with per-tab storage there is nothing for tabs to keep in step.
{
  const auth = supabase.auth as unknown as { broadcastChannel?: BroadcastChannel | null }
  auth.broadcastChannel?.close()
  auth.broadcastChannel = null
}

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

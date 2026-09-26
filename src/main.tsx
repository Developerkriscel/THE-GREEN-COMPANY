import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { applyBrand, type BrandSettings } from '@/lib/brand'
import '@/index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
  },
})

/**
 * The company details the office saved (Admin → Business Settings), applied
 * before any page module loads -- several build text from BRAND when they are
 * first imported. Never blocks for long: a slow or failed fetch renders with
 * the built-in defaults.
 */
async function loadBrand() {
  const fetched = supabase
    .from('site_settings').select('value').eq('key', 'public.brand').maybeSingle()
    .then(({ data }) => applyBrand((data?.value as Partial<BrandSettings> | undefined) ?? null))
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2500))
  await Promise.race([fetched.then(() => undefined, () => undefined), timeout])
}

async function boot() {
  await loadBrand()
  const [{ AuthProvider }, { ToastProvider }, { App }] = await Promise.all([
    import('@/context/AuthContext'),
    import('@/components/ui'),
    import('@/App'),
  ])

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <AuthProvider>
            <ToastProvider>
              <App />
            </ToastProvider>
          </AuthProvider>
        </BrowserRouter>
      </QueryClientProvider>
    </StrictMode>,
  )
}

void boot()

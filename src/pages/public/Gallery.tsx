import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'

interface GalleryPhoto {
  id: string
  url: string
  caption: string | null
  sort_order: number
}

async function fetchGallery(): Promise<GalleryPhoto[]> {
  const { data, error } = await supabase
    .from('gallery_photos')
    .select('id, url, caption, sort_order')
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
  if (error) throw error
  return data ?? []
}

export function GalleryPage() {
  const { data: photos = [], isLoading } = useQuery({
    queryKey: ['gallery'],
    queryFn: fetchGallery,
  })

  return (
    <>
      {/* Hero */}
      <section
        className="py-20 text-white text-center relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, oklch(20% .06 260) 0%, oklch(14% .05 260) 45%, oklch(62% .19 43) 100%)' }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.03]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '40px 40px' }}
        />
        <div className="relative mx-auto max-w-screen-xl px-6 lg:px-8">
          <span className="inline-block mb-3 text-xs font-bold uppercase tracking-[.2em] text-[oklch(72%_.18_48)]">Visual Story</span>
          <h1 className="text-4xl font-extrabold sm:text-5xl mb-4">Gallery</h1>
          <p className="mx-auto max-w-xl text-lg text-white/60">
            Moments from our events, award ceremonies and project launches.
          </p>
        </div>
      </section>

      {/* Masonry grid */}
      <section className="py-16 bg-gray-50">
        <div className="mx-auto max-w-screen-xl px-4 lg:px-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="h-10 w-10 rounded-full border-4 border-[oklch(62%_.19_43)] border-t-transparent animate-spin" />
            </div>
          ) : photos.length === 0 ? (
            <p className="text-center text-gray-400 py-24">No photos yet.</p>
          ) : (
            <div className="columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-3">
              {photos.map((photo) => (
                <div key={photo.id} className="mb-3 break-inside-avoid overflow-hidden rounded-xl shadow-sm hover:shadow-lg transition-shadow">
                  <img
                    src={photo.url}
                    alt={photo.caption ?? 'Gallery photo'}
                    loading="lazy"
                    className="w-full object-cover block"
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 bg-white text-center">
        <div className="mx-auto max-w-lg px-6">
          <h2 className="text-2xl font-extrabold text-[oklch(14%_.05_260)]">Be Part of Our Story</h2>
          <p className="mt-3 text-gray-500">Join thousands of partners creating success across India.</p>
          <a
            href="/register"
            className="mt-6 inline-block rounded-xl px-8 py-3.5 text-sm font-bold text-white shadow-lg hover:-translate-y-0.5 transition-all"
            style={{ background: 'linear-gradient(135deg, oklch(68% .18 48), oklch(54% .19 40))' }}
          >
            Join Royal Green
          </a>
        </div>
      </section>
    </>
  )
}

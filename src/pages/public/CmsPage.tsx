import { useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import { EmptyState, Spinner } from '@/components/ui'

export function CmsPage({ slug: fixedSlug }: { slug?: string }) {
  const params = useParams()
  const slug = fixedSlug ?? params.slug

  const { data, isLoading } = useQuery({
    queryKey: ['cms-page', slug],
    enabled: Boolean(slug),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('cms_pages')
        .select('*')
        .eq('slug', slug!)
        .eq('published', true)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as { title: string; body: string } | null
    },
  })

  if (isLoading) return <Spinner />
  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20">
        <EmptyState title="Page not found" />
      </div>
    )
  }

  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <h1 className="font-display text-3xl font-semibold text-slate-900">{data.title}</h1>
      <div className="mt-6 whitespace-pre-line text-sm leading-relaxed text-slate-700">{data.body}</div>
    </article>
  )
}

import { Link } from 'react-router-dom'
import { Button } from '@/components/ui'

export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50 px-4 text-center">
      <p className="font-display text-6xl font-bold text-brand-700">404</p>
      <h1 className="text-lg font-semibold text-slate-900">This page does not exist</h1>
      <p className="max-w-sm text-sm text-slate-600">
        The link may be broken, or you may not have access to this area.
      </p>
      <Link to="/">
        <Button>Back to the website</Button>
      </Link>
    </div>
  )
}

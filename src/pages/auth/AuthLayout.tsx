import { Link } from 'react-router-dom'
import { BRAND, copyright } from '@/lib/brand'

interface AuthLayoutProps {
  children: React.ReactNode
  title: string
  subtitle?: string
  badge?: string
  footer?: React.ReactNode
}

export function AuthLayout({ children, title, subtitle, badge, footer }: AuthLayoutProps) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-4 py-12 font-sans"
      style={{
        background: 'linear-gradient(135deg, oklch(20% .06 260) 0%, oklch(14% .05 260) 45%, oklch(62% .19 43) 100%)',
      }}
    >
      {/* Card */}
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex flex-col items-center gap-3">
            <img
              src="/brand-mark-512.png"
              alt={BRAND.name}
              className="h-16 w-auto rounded-xl object-contain shadow-elegant"
            />
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header stripe */}
          <div className="bg-[oklch(20%_.06_260)] px-8 py-6">
            {badge && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[oklch(62%_.19_43)]/40 bg-[oklch(62%_.19_43)]/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-[oklch(72%_.18_48)] mb-3">
                <span className="h-1.5 w-1.5 rounded-full bg-[oklch(62%_.19_43)]" />
                {badge}
              </span>
            )}
            <h1 className="text-2xl font-bold text-white">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-white/50">{subtitle}</p>}
          </div>

          {/* Form area */}
          <div className="px-8 py-8">{children}</div>
          {footer && <div className="border-t border-gray-100 px-8 py-4 bg-gray-50">{footer}</div>}
        </div>

        <p className="mt-6 text-center text-xs text-white/30">
          {copyright()}
        </p>
      </div>
    </div>
  )
}

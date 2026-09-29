import { Link } from 'react-router-dom'
import { BrandLockup } from '@/components/BrandLockup'
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
        background: 'radial-gradient(circle at 85% 15%, rgb(var(--c-gold) / .2), transparent 45%), linear-gradient(135deg, rgb(var(--c-dark)) 0%, rgb(var(--c-darker)) 55%, rgb(var(--c-leaf-dark)) 100%)',
      }}
    >
      {/* Card */}
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex" aria-label={BRAND.name}>
            <BrandLockup size="lg" align="center" />
          </Link>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header stripe */}
          <div className="bg-brand-dark px-8 py-6">
            {badge && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-primary/40 bg-brand-primary/10 px-3 py-1 text-xs font-bold uppercase tracking-widest text-brand-primary-glow mb-3">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-primary" />
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

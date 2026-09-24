import { useState, useEffect } from 'react'
import { Link, Outlet, useLocation } from 'react-router-dom'

const NAV_LINKS = [
  { label: 'Home', href: '/' },
  { label: 'About', href: '/about' },
  { label: 'Plans', href: '/plans' },
  { label: 'Projects', href: '/projects' },
  { label: 'Rewards', href: '/rewards' },
  { label: 'Gallery', href: '/gallery' },
  { label: 'Events', href: '/events' },
  { label: 'News', href: '/news' },
  { label: 'Team', href: '/team' },
  { label: 'Contact', href: '/contact' },
]

export function PublicLayout() {
  const [scrolled, setScrolled] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => { setMenuOpen(false) }, [pathname])

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      {/* ── Navbar ── */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-[oklch(14%_.05_260)]/95 backdrop-blur-md shadow-lg'
            : 'bg-[oklch(14%_.05_260)]'
        }`}
      >
        <div className="mx-auto max-w-screen-xl px-4 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex items-center gap-2.5 flex-shrink-0">
              <img
                src="https://dvocohgawbllsboocytf.supabase.co/storage/v1/object/sign/cms-gallery/logo-1786708679018.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS9sb2dvLTE3ODY3MDg2NzkwMTguanBlZyIsInNjb3BlIjoiZG93bmxvYWQiLCJpYXQiOjE3ODY3MDg2ODAsImV4cCI6MjEwMjA2ODY4MH0.jWCBVK2lD6Cvupx_kd-JBBDksbz8FdWfAm08J7dfPxw"
                alt="Royal Green Company"
                className="h-10 w-auto rounded-lg object-contain"
              />
            </Link>

            {/* Desktop nav */}
            <nav className="hidden xl:flex items-center gap-0.5">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                    pathname === link.href
                      ? 'text-[oklch(72%_.18_48)] bg-white/5'
                      : 'text-white/80 hover:text-white hover:bg-white/5'
                  }`}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Auth buttons */}
            <div className="hidden lg:flex items-center gap-2">
              <Link
                to="/sponsor-login"
                className="px-4 py-1.5 text-sm font-semibold text-white/90 border border-white/20 rounded-md hover:bg-white/10 transition-colors"
              >
                Login
              </Link>
              <Link
                to="/register"
                className="px-4 py-1.5 text-sm font-bold rounded-md bg-[oklch(62%_.19_43)] hover:bg-[oklch(54%_.19_40)] text-white shadow-elegant transition-colors"
              >
                Join Now
              </Link>
            </div>

            {/* Mobile hamburger */}
            <button
              className="xl:hidden flex flex-col items-center justify-center gap-1.5 p-2 text-white"
              onClick={() => setMenuOpen(!menuOpen)}
              aria-label="Toggle menu"
            >
              <span className={`block h-0.5 w-6 bg-white transition-all duration-200 ${menuOpen ? 'rotate-45 translate-y-2' : ''}`} />
              <span className={`block h-0.5 w-6 bg-white transition-all duration-200 ${menuOpen ? 'opacity-0' : ''}`} />
              <span className={`block h-0.5 w-6 bg-white transition-all duration-200 ${menuOpen ? '-rotate-45 -translate-y-2' : ''}`} />
            </button>
          </div>
        </div>

        {/* Mobile menu */}
        {menuOpen && (
          <div className="xl:hidden border-t border-white/10 bg-[oklch(14%_.05_260)] py-3 px-4">
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                to={link.href}
                className="block py-2.5 text-sm font-medium text-white/80 hover:text-white border-b border-white/5 last:border-0"
              >
                {link.label}
              </Link>
            ))}
            <div className="mt-4 flex gap-2">
              <Link to="/sponsor-login" className="flex-1 py-2 text-center text-sm font-semibold text-white border border-white/20 rounded-md">Login</Link>
              <Link to="/register" className="flex-1 py-2 text-center text-sm font-bold rounded-md bg-[oklch(62%_.19_43)] text-white">Join Now</Link>
            </div>
          </div>
        )}
      </header>

      {/* ── Page content ── */}
      <main className="pt-16"><Outlet /></main>

      {/* ── Footer ── */}
      <footer className="bg-[oklch(14%_.05_260)] text-white">
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
            {/* Brand */}
            <div className="lg:col-span-1">
              <Link to="/" className="flex items-center gap-2.5 mb-4">
                <img
                  src="https://dvocohgawbllsboocytf.supabase.co/storage/v1/object/sign/cms-gallery/logo-1786708679018.jpeg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV8xNjJjYWYwMi1jYWU0LTQyNmEtOWViNi02NzNjNzNjMzdjOWIiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJjbXMtZ2FsbGVyeS9sb2dvLTE3ODY3MDg2NzkwMTguanBlZyIsInNjb3BlIjoiZG93bmxvYWQiLCJpYXQiOjE3ODY3MDg2ODAsImV4cCI6MjEwMjA2ODY4MH0.jWCBVK2lD6Cvupx_kd-JBBDksbz8FdWfAm08J7dfPxw"
                  alt="Royal Green Company"
                  className="h-12 w-auto rounded-lg object-contain"
                />
              </Link>
              <p className="text-sm text-white/50 leading-relaxed">
                India's trusted real estate network. Earn direct income, level commissions and lifetime rewards.
              </p>
              <div className="mt-5 flex gap-3">
                {['facebook', 'instagram', 'youtube', 'twitter'].map((s) => (
                  <a key={s} href="#" className="flex h-8 w-8 items-center justify-center rounded-full border border-white/15 text-white/50 hover:text-white hover:border-white/30 transition-colors text-xs uppercase font-bold">
                    {s[0].toUpperCase()}
                  </a>
                ))}
              </div>
            </div>

            {/* Quick links */}
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-[oklch(62%_.19_43)] mb-5">Quick Links</h4>
              <ul className="space-y-2.5">
                {NAV_LINKS.slice(0, 5).map((link) => (
                  <li key={link.href}>
                    <Link to={link.href} className="text-sm text-white/50 hover:text-white transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            {/* Company */}
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-[oklch(62%_.19_43)] mb-5">Company</h4>
              <ul className="space-y-2.5">
                {NAV_LINKS.slice(5).map((link) => (
                  <li key={link.href}>
                    <Link to={link.href} className="text-sm text-white/50 hover:text-white transition-colors">
                      {link.label}
                    </Link>
                  </li>
                ))}
                <li>
                  <Link to="/sponsor-login" className="text-sm text-white/50 hover:text-white transition-colors">Sponsor Login</Link>
                </li>
                <li>
                  <Link to="/admin-login" className="text-sm text-white/50 hover:text-white transition-colors">Admin Login</Link>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-[oklch(62%_.19_43)] mb-5">Contact Us</h4>
              <ul className="space-y-3 text-sm text-white/50">
                <li className="flex gap-2">
                  <span className="mt-0.5 flex-shrink-0 text-[oklch(62%_.19_43)]">📍</span>
                  ILD Trade Centre Mall, Sector-47, Gurugram, Haryana
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 flex-shrink-0 text-[oklch(62%_.19_43)]">📞</span>
                  +91 9211809636
                </li>
                <li className="flex gap-2">
                  <span className="mt-0.5 flex-shrink-0 text-[oklch(62%_.19_43)]">✉️</span>
                  support@royalgreencompany.com
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10">
          <div className="mx-auto max-w-screen-xl px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-white/30">© {new Date().getFullYear()} Royal Green Company. All rights reserved.</p>
            <div className="flex gap-5 text-xs text-white/30">
              <a href="#" className="hover:text-white/60">Privacy Policy</a>
              <a href="#" className="hover:text-white/60">Terms of Service</a>
              <a href="#" className="hover:text-white/60">Disclaimer</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  )
}

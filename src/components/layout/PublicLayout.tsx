import { useState, useEffect } from 'react'
import { BrandLockup } from '@/components/BrandLockup'
import { Link, Outlet, useLocation } from 'react-router-dom'
import { ChevronRight, Mail, MapPin, MessageCircle, Phone } from 'lucide-react'
import { BRAND, copyright } from '@/lib/brand'

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

  // Sections below the first rise into view as the visitor scrolls.
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => {
        if (e.isIntersecting) { e.target.classList.add('reveal-in'); io.unobserve(e.target) }
      }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.06 },
    )
    const t = window.setTimeout(() => {
      document.querySelectorAll('main > section:not(:first-child), main > * > section:not(:first-child)').forEach((el) => {
        if (el.getBoundingClientRect().top < window.innerHeight) return // already on screen: leave it be
        el.classList.add('reveal')
        io.observe(el)
      })
    }, 60)
    return () => { window.clearTimeout(t); io.disconnect() }
  }, [pathname])

  return (
    <div className="min-h-screen bg-white font-sans text-gray-900">
      {/* ── Navbar ── */}
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
          scrolled
            ? 'bg-brand-darker/95 backdrop-blur-md shadow-lg'
            : 'bg-brand-darker'
        }`}
      >
        <div className="gold-hairline absolute inset-x-0 bottom-0" aria-hidden />
        <div className="mx-auto max-w-screen-xl px-4 lg:px-8">
          <div className="flex h-16 items-center justify-between">
            {/* Logo */}
            <Link to="/" className="flex min-w-0 items-center flex-shrink" aria-label={BRAND.name}>
              <BrandLockup size="sm" />
            </Link>

            {/* Desktop nav */}
            <nav className="hidden xl:flex items-center gap-0.5">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  to={link.href}
                  className={`whitespace-nowrap px-2 py-1.5 text-[13px] font-medium rounded-md transition-colors 2xl:px-3 2xl:text-sm ${
                    pathname === link.href
                      ? 'text-brand-primary-glow bg-white/5'
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
                className="whitespace-nowrap px-3 py-1.5 text-sm font-semibold text-white/90 border border-white/20 rounded-md hover:bg-white/10 transition-colors"
              >
                Channel Partner
              </Link>
              <Link
                to="/customer-login"
                className="whitespace-nowrap px-3 py-1.5 text-sm font-semibold text-brand-gold-light border border-brand-gold/40 rounded-md hover:bg-brand-gold/10 transition-colors"
              >
                Customer
              </Link>
              <Link
                to="/register"
                className="btn-gold whitespace-nowrap px-3 py-1.5 text-sm rounded-md"
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
          <div className="xl:hidden bg-leaf-deep border-t border-brand-gold/20 px-5 pb-6 pt-2 animate-fade-in max-h-[calc(100vh-4rem)] overflow-y-auto">
            <nav className="grid">
              {NAV_LINKS.map((link) => {
                const active = pathname === link.href
                return (
                  <Link
                    key={link.href}
                    to={link.href}
                    className={`flex items-center justify-between border-b border-white/[0.07] py-3.5 text-[15px] font-semibold ${active ? 'text-brand-gold-light' : 'text-white/85 active:text-white'}`}
                  >
                    <span className="flex items-center gap-3">
                      <span className={`h-1.5 w-1.5 rotate-45 ${active ? 'bg-brand-gold shadow-[0_0_8px_rgb(var(--c-gold))]' : 'bg-brand-gold/40'}`} aria-hidden />
                      {link.label}
                    </span>
                    <ChevronRight className="h-4 w-4 text-brand-gold/50" aria-hidden />
                  </Link>
                )
              })}
            </nav>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <Link to="/sponsor-login" className="rounded-xl border border-brand-gold/40 py-3 text-center text-sm font-semibold text-brand-gold-light">Channel Partner</Link>
              <Link to="/register" className="btn-gold rounded-xl py-3 text-center text-sm">Join Now</Link>
              <Link to="/customer-login" className="col-span-2 rounded-xl bg-white/[0.06] py-2.5 text-center text-sm font-semibold text-brand-gold-light ring-1 ring-brand-gold/30">Customer Login — my plot &amp; EMI</Link>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <a href={BRAND.phoneHref} className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] py-2.5 text-sm font-medium text-white/85 ring-1 ring-white/10">
                <Phone className="h-4 w-4 text-brand-gold" aria-hidden /> Call us
              </a>
              <a href={`https://wa.me/91${BRAND.whatsapp.replace(/\D/g, '').slice(-10)}`} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-2 rounded-xl bg-white/[0.06] py-2.5 text-sm font-medium text-white/85 ring-1 ring-white/10">
                <MessageCircle className="h-4 w-4 text-brand-gold" aria-hidden /> WhatsApp
              </a>
            </div>
            <p className="text-gold-metal mt-5 text-center text-sm font-semibold italic">{BRAND.tagline}</p>
          </div>
        )}
      </header>

      {/* ── Page content ── */}
      <main className="pt-16"><Outlet /></main>

      {/* ── Footer ── */}
      <footer className="bg-brand-darker text-white">
        <div className="gold-hairline" aria-hidden />
        <div className="mx-auto max-w-screen-xl px-6 lg:px-8 py-16">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
            {/* Brand */}
            <div className="lg:col-span-1">
              <Link to="/" className="mb-4 flex" aria-label={BRAND.name}>
                <BrandLockup size="md" />
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
              <h4 className="text-sm font-bold uppercase tracking-widest text-brand-primary mb-5">Quick Links</h4>
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
              <h4 className="text-sm font-bold uppercase tracking-widest text-brand-primary mb-5">Company</h4>
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
                  <Link to="/customer-login" className="text-sm text-white/50 hover:text-white transition-colors">Customer Login</Link>
                </li>
                <li>
                  <Link to="/admin-login" className="text-sm text-white/50 hover:text-white transition-colors">Admin Login</Link>
                </li>
              </ul>
            </div>

            {/* Contact */}
            <div>
              <h4 className="text-sm font-bold uppercase tracking-widest text-brand-primary mb-5">Contact Us</h4>
              <ul className="space-y-3 text-sm text-white/50">
                <li className="flex gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-gold" aria-hidden />
                  {BRAND.address}
                </li>
                <li className="flex gap-2">
                  <Phone className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-gold" aria-hidden />
                  +91 {BRAND.phone}
                </li>
                <li className="flex gap-2">
                  <Mail className="mt-0.5 h-4 w-4 flex-shrink-0 text-brand-gold" aria-hidden />
                  {BRAND.email}
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom bar */}
        <div className="border-t border-white/10">
          <div className="mx-auto max-w-screen-xl px-6 lg:px-8 py-5 flex flex-col sm:flex-row items-center justify-between gap-3">
            <p className="text-xs text-white/30">{copyright()}</p>
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

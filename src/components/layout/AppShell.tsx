import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'
import { Bell, LogOut, Menu, X } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { ago } from '@/lib/format'
import { RankBadge } from '@/components/status'
import { BRAND } from '@/lib/brand'
import { Avatar } from '@/components/Avatar'
import type { Notification } from '@/lib/types'

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
  /** A short label for the phone's bottom bar. */
  short?: string
}

export function AppShell({
  nav,
  area,
  banner,
  quick,
  children,
}: {
  nav: NavItem[]
  area: string
  /** The four destinations on the phone's bottom bar (by `to`); "More" opens the full menu. */
  quick?: string[]
  /** Rendered above the page, inside the scroll area. The sponsor panel passes
   *  its announcement strip here; the admin console passes nothing. */
  banner?: ReactNode
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { profile, signOut } = useAuth()
  const bottom = (quick ?? nav.slice(0, 4).map((n) => n.to))
    .map((to) => nav.find((n) => n.to === to))
    .filter((n): n is NavItem => Boolean(n))

  return (
    /* Deep leaf-green sidebar edged in gold, an ivory workspace lit by a soft
       gold glow, and a frosted top bar: the logo's palette, in the panels. */
    <div className="panel-canvas flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside
        className={clsx(
          'panel-sidebar fixed inset-y-0 left-0 z-50 flex h-full w-64 shrink-0 flex-col text-white transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="relative flex h-[72px] shrink-0 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-3">
            <img
              src={BRAND.markSquare}
              alt={BRAND.name}
              className="h-12 w-12 shrink-0 object-contain"
              style={{ filter: 'drop-shadow(0 2px 6px rgb(0 0 0 / .45)) drop-shadow(0 0 10px rgb(var(--c-gold) / .25))' }}
              onError={(e) => {
                ;(e.target as HTMLElement).style.display = 'none'
              }}
            />
            <div className="leading-tight">
              <p className="text-gold-metal text-[15px] font-extrabold uppercase tracking-[0.2em]">{BRAND.short}</p>
              <p className="mt-0.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/55">
                {area === 'Administration' ? 'Admin Console' : 'Sponsor Panel'}
              </p>
            </div>
          </Link>
          <button className="rounded p-1 text-white/60 hover:text-white lg:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="gold-hairline mx-4" aria-hidden />
        <div className="flex items-center gap-2 px-5 pt-4 pb-2 text-[10px] font-bold uppercase tracking-[0.22em] text-brand-gold/70">
          <span className="h-1.5 w-1.5 rotate-45 bg-brand-gold/80" aria-hidden />
          Navigation
        </div>

        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-3 pb-3 [scrollbar-width:thin]">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-all',
                  isActive
                    ? 'nav-active font-semibold'
                    : 'text-white/70 hover:bg-white/[0.06] hover:text-white hover:translate-x-0.5',
                )
              }
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 p-3">
          <div className="rounded-2xl bg-white/[0.05] p-3 ring-1 ring-brand-gold/20">
            <div className="flex items-center gap-3">
              <span className="rounded-full p-[2px] bg-gold-metal shadow">
                <Avatar path={profile?.avatar_path} name={profile?.full_name || profile?.email} size={36} tone="brand" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-white">{profile?.full_name || 'Member'}</p>
                <p className="truncate text-[11px] font-mono text-white/50">{profile?.member_code ?? profile?.user_code ?? profile?.email}</p>
              </div>
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-brand-gold/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-gold-light ring-1 ring-brand-gold/30">
                {profile?.role === 'admin' ? 'Administrator' : profile?.role === 'rep' ? 'Sponsor' : profile?.role ?? '—'}
              </span>
              {profile?.rank?.name && <RankBadge name={profile.rank.name} />}
            </div>
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-40 bg-brand-darker/60 backdrop-blur-sm lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden">
        <header className="glass-bar relative flex h-16 shrink-0 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="gold-hairline absolute inset-x-0 bottom-0" aria-hidden />
          <div className="flex items-center gap-3">
            {/* On phones and tablets the menu opens from "More" in the bottom bar. */}
            <img src={BRAND.markSquare} alt="" className="h-9 w-9 object-contain drop-shadow lg:hidden" />
            <div className="leading-tight">
              <p className="whitespace-nowrap text-[10px] font-bold uppercase tracking-[0.22em] text-brand-gold-deep">
                {area === 'Administration' ? 'Admin Console' : 'Sponsor Panel'}
              </p>
              <p className="hidden text-sm font-semibold text-brand-darker sm:block">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
              <p className="text-gold-metal text-sm font-extrabold uppercase tracking-[0.18em] sm:hidden">{BRAND.short}</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <NotificationBell />
            <Link
              to={`${nav[0]?.to.split('/').slice(0, 2).join('/')}/profile`}
              className="flex items-center gap-2 rounded-full py-1 pl-1 pr-1 transition-colors hover:bg-brand-gold/10 sm:pr-3"
              title="Profile"
            >
              <span className="rounded-full bg-gold-metal p-[2px]">
                <Avatar path={profile?.avatar_path} name={profile?.full_name || profile?.email} size={30} tone="brand" />
              </span>
              <span className="hidden text-sm font-semibold text-brand-darker sm:inline">
                {profile?.full_name?.split(' ')[0] || 'Profile'}
              </span>
            </Link>
            <button
              onClick={() => void signOut()}
              className="flex items-center gap-1.5 rounded-full border border-brand-gold/30 px-3 py-1.5 text-sm font-medium text-brand-darker transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
              title="Log out"
            >
              <LogOut className="h-4 w-4" />
              <span className="hidden sm:inline">Logout</span>
            </button>
          </div>
        </header>

        {/* The main scroll area */}
        <main className="min-w-0 flex-1 overflow-y-auto p-4 pb-28 sm:p-6 sm:pb-28 lg:p-8">
          {banner && <div className="mb-4">{banner}</div>}
          {children ?? <Outlet />}
        </main>

        {/* Phones: an app-style bottom bar with the four main places and "More". */}
        <nav
          className="fixed inset-x-0 bottom-0 z-40 border-t border-brand-gold/25 bg-brand-darker/95 px-2 pt-1.5 backdrop-blur-xl lg:hidden"
          style={{ paddingBottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
          aria-label="Quick navigation"
        >
          <div className="gold-hairline absolute inset-x-0 top-0" aria-hidden />
          <div className="mx-auto grid max-w-md grid-cols-5">
            {bottom.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  clsx(
                    'flex flex-col items-center gap-1 rounded-xl py-1 text-[10.5px] font-semibold transition',
                    isActive ? 'text-brand-gold-light' : 'text-white/60 active:text-white',
                  )
                }
              >
                {({ isActive }) => (
                  <>
                    <span
                      className={clsx(
                        'flex h-8 w-8 items-center justify-center rounded-full transition',
                        isActive ? 'bg-gold-metal text-brand-darker shadow-[0_0_14px_rgb(var(--c-gold)/0.55)]' : '',
                      )}
                    >
                      {item.icon}
                    </span>
                    <span className="max-w-full truncate">{item.short ?? item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
            <button
              onClick={() => setOpen(true)}
              className="flex flex-col items-center gap-1 rounded-xl py-1 text-[10.5px] font-semibold text-white/60 active:text-white"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full">
                <Menu className="h-[18px] w-[18px]" />
              </span>
              More
            </button>
          </div>
        </nav>
      </div>
    </div>
  )
}

function NotificationBell() {
  const [open, setOpen] = useState(false)
  const { profile } = useAuth()
  const qc = useQueryClient()

  const { data = [] } = useQuery({
    queryKey: ['notifications', profile?.id],
    enabled: Boolean(profile?.id),
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      if (error) throw error
      return data as Notification[]
    },
  })

  const unread = data.filter((n) => !n.read_at).length

  async function markAllRead() {
    const ids = data.filter((n) => !n.read_at).map((n) => n.id)
    if (!ids.length) return
    await supabase.from('notifications').update({ read_at: new Date().toISOString() }).in('id', ids)
    void qc.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative rounded-full p-2.5 text-brand-darker/70 transition-colors hover:bg-brand-gold/10 hover:text-brand-darker"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-gold-metal px-1 text-[10px] font-bold text-brand-darker ring-2 ring-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-2xl border border-brand-gold/20 bg-white shadow-2xl">
            <div className="h-1 bg-gold-metal" aria-hidden />
            <div className="flex items-center justify-between border-b border-brand-gold/15 px-4 py-2.5">
              <p className="text-sm font-semibold">Notifications</p>
              <button onClick={() => void markAllRead()} className="text-xs text-brand-700 hover:underline">
                Mark all read
              </button>
            </div>
            <div className="max-h-96 overflow-y-auto">
              {data.length === 0 && (
                <p className="px-4 py-8 text-center text-sm text-slate-500">Nothing yet.</p>
              )}
              {data.map((n) => (
                <Link
                  key={n.id}
                  to={n.link ?? '#'}
                  onClick={() => setOpen(false)}
                  className={clsx(
                    'block border-b border-slate-100 px-4 py-3 last:border-0 hover:bg-slate-50',
                    !n.read_at && 'bg-brand-gold/[0.07]',
                  )}
                >
                  <p className="text-sm font-medium text-slate-900">{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{n.body}</p>}
                  <p className="mt-1 text-[11px] text-slate-400">{ago(n.created_at)}</p>
                </Link>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}

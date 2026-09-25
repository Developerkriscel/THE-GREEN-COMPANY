import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'
import { Bell, LogOut, Menu, User, X } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { ago } from '@/lib/format'
import { Badge } from '@/components/ui'
import { RankBadge } from '@/components/status'
import { BRAND } from '@/lib/brand'
import { Avatar } from '@/components/Avatar'
import type { Notification } from '@/lib/types'

export interface NavItem {
  to: string
  label: string
  icon: ReactNode
  end?: boolean
}

export function AppShell({
  nav,
  area,
  banner,
  children,
}: {
  nav: NavItem[]
  area: string
  /** Rendered above the page, inside the scroll area. The sponsor panel passes
   *  its announcement strip here; the admin console passes nothing. */
  banner?: ReactNode
  children?: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const { profile, signOut } = useAuth()

  return (
    /* Shell matching production portal styling: Dark Navy sidebar, warm canvas, sticky topbar */
    <div className="flex h-screen overflow-hidden bg-[#fbf8f4]">
      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 flex h-full w-64 shrink-0 flex-col bg-[#0b192c] text-white border-r border-slate-800 transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 shrink-0 items-center justify-between px-4 border-b border-slate-800/80">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#ea580c] text-white font-bold shadow">
              <img
                src={BRAND.markSquare}
                alt={BRAND.name}
                className="h-7 w-7 rounded object-cover"
                onError={(e) => {
                  ;(e.target as HTMLElement).style.display = 'none'
                }}
              />
            </div>
            <div className="leading-tight">
              <p className="text-xs font-bold tracking-wider text-white uppercase">{BRAND.name}</p>
              <p className="text-[10px] font-semibold tracking-widest text-slate-400 uppercase">
                {area === 'Administration' ? 'ADMIN CONSOLE' : 'SPONSOR PANEL'}
              </p>
            </div>
          </Link>
          <button className="rounded p-1 text-slate-400 hover:text-white lg:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="px-4 pt-4 pb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
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
                  'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-[#152e4d] text-white font-semibold shadow-sm'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white',
                )
              }
            >
              <span className="shrink-0">{item.icon}</span>
              <span className="truncate">{item.label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="shrink-0 border-t border-slate-800 bg-[#081220] p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-1.5">
            <Avatar path={profile?.avatar_path} name={profile?.full_name || profile?.email} size={36} tone="brand" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-white">{profile?.full_name || 'Member'}</p>
              <p className="truncate text-xs font-mono text-slate-400">{profile?.user_code ?? profile?.email}</p>
            </div>
          </div>
          <div className="mt-1 flex flex-wrap gap-1 px-2">
            <Badge tone="blue">{profile?.role ?? '—'}</Badge>
            {profile?.rank?.name && <RankBadge name={profile.rank.name} />}
          </div>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-[#fbf8f4]">
        <header className="flex h-14 shrink-0 items-center justify-between gap-3 border-b border-slate-200/80 bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              className="rounded p-1.5 text-slate-600 hover:bg-slate-100"
              onClick={() => setOpen((prev) => !prev)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
              <span>{area === 'Administration' ? 'Admin panel' : 'Sponsor panel'}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <NotificationBell />
            <Link
              to={`${nav[0]?.to.split('/').slice(0, 2).join('/')}/profile`}
              className="rounded-full p-2 text-slate-600 transition-colors hover:bg-slate-100"
              title="Profile"
            >
              <User className="h-5 w-5" />
            </Link>
            <span className="hidden text-sm font-medium text-slate-700 sm:inline">
              Hi, {profile?.full_name || 'User'}
            </span>
            <button
              onClick={() => void signOut()}
              className="ml-2 flex items-center gap-1.5 text-sm font-medium text-slate-700 transition-colors hover:text-red-600"
            >
              <LogOut className="h-4 w-4" />
              <span>Logout</span>
            </button>
          </div>
        </header>

        {/* The main scroll area */}
        <main className="min-w-0 flex-1 overflow-y-auto bg-[#fbf8f4] p-4 sm:p-6">
          {banner && <div className="mb-4">{banner}</div>}
          {children ?? <Outlet />}
        </main>
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
        className="relative rounded-full p-2.5 text-slate-600 transition-colors hover:bg-slate-200/60"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-semibold text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
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
                    !n.read_at && 'bg-brand-50/40',
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

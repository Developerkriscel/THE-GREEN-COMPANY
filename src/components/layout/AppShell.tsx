import { useState, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import clsx from 'clsx'
import { Bell, LogOut, Menu, User, X } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { ago, initials } from '@/lib/format'
import { Badge } from '@/components/ui'
import { RankBadge } from '@/components/status'
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
    <div className="flex min-h-screen bg-slate-50">
      {/* Sidebar */}
      <aside
        className={clsx(
          'fixed inset-y-0 left-0 z-50 w-64 shrink-0 border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
          <Link to="/" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-700 font-display font-bold text-white">
              R
            </span>
            <div className="leading-tight">
              <p className="font-display text-sm font-semibold">Royal Green</p>
              <p className="text-[11px] uppercase tracking-wide text-slate-500">{area}</p>
            </div>
          </Link>
          <button className="rounded p-1 text-slate-500 lg:hidden" onClick={() => setOpen(false)}>
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex flex-col gap-0.5 overflow-y-auto p-3">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                clsx(
                  'flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition',
                  isActive
                    ? 'bg-brand-50 text-brand-800'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                )
              }
            >
              {item.icon}
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto border-t border-slate-200 p-3">
          <div className="flex items-center gap-2.5 rounded-lg px-2 py-2">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
              {initials(profile?.full_name)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{profile?.full_name || '—'}</p>
              <p className="truncate text-xs text-slate-500">{profile?.user_code ?? profile?.email}</p>
            </div>
          </div>
          <div className="mt-1 flex flex-wrap gap-1 px-2">
            <Badge tone="blue">{profile?.role ?? '—'}</Badge>
            {profile?.rank?.name && <RankBadge name={profile.rank.name} />}
          </div>
          <button
            onClick={() => void signOut()}
            className="mt-2 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>

      {open && <div className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden" onClick={() => setOpen(false)} />}

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 sm:px-6">
          <button className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)}>
            <Menu className="h-5 w-5" />
          </button>
          <div className="flex-1" />
          <NotificationBell />
          <Link
            to={`${nav[0]?.to.split('/').slice(0, 2).join('/')}/profile`}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100"
            title="Profile"
          >
            <User className="h-5 w-5" />
          </Link>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">
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
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100"
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

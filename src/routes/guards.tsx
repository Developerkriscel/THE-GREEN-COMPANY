import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { Link } from 'react-router-dom'
import { ShieldAlert, Clock } from 'lucide-react'
import { useAuth, homeRouteFor } from '@/context/AuthContext'
import { Button, Spinner } from '@/components/ui'
import type { AppRole } from '@/lib/types'

/**
 * Route guards are ADVISORY only. Every page still issues RLS-constrained
 * queries, so a bypassed guard yields an empty screen — never data.
 */
export function RequireAuth({ roles }: { roles?: AppRole[] }) {
  const { session, profile, loading } = useAuth()
  const location = useLocation()

  if (loading) return <Spinner label="Checking your session…" />

  if (!session) {
    // The office signs in at one door, members at the other.
    const to = roles?.includes('admin') ? '/admin-login' : '/sponsor-login'
    return <Navigate to={to} state={{ from: location.pathname }} replace />
  }

  if (!profile) return <Spinner label="Loading your profile…" />

  if (profile.status === 'pending') return <PendingApproval />
  if (profile.status === 'suspended') return <Suspended />

  if (roles && !roles.includes(profile.role)) {
    return <Navigate to={homeRouteFor(profile.role)} replace />
  }

  return <Outlet />
}

/** Redirects an already-signed-in user away from the login pages. */
export function RedirectIfAuthed() {
  const { session, profile, loading } = useAuth()
  if (loading) return <Spinner />
  if (session && profile && profile.status === 'active') {
    return <Navigate to={homeRouteFor(profile.role)} replace />
  }
  return <Outlet />
}

function PendingApproval() {
  const { signOut, profile } = useAuth()
  return (
    <Notice
      icon={<Clock className="h-6 w-6 text-amber-600" />}
      title="Your account is awaiting approval"
      body={
        <>
          Your registration was received{profile?.user_code ? ` (ID ${profile.user_code})` : ''}. A sales
          administrator reviews new accounts before activation — you will get an email as soon as it is
          approved.
        </>
      }
      onSignOut={signOut}
    />
  )
}

function Suspended() {
  const { signOut } = useAuth()
  return (
    <Notice
      icon={<ShieldAlert className="h-6 w-6 text-red-600" />}
      title="This account is suspended"
      body="Access has been suspended by an administrator. Contact your administrator if you believe this is a mistake."
      onSignOut={signOut}
    />
  )
}

function Notice({
  icon,
  title,
  body,
  onSignOut,
}: {
  icon: React.ReactNode
  title: string
  body: React.ReactNode
  onSignOut: () => Promise<void>
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
          {icon}
        </div>
        <h1 className="text-lg font-semibold text-slate-900">{title}</h1>
        <p className="mt-2 text-sm text-slate-600">{body}</p>
        <div className="mt-6 flex justify-center gap-2">
          <Link to="/">
            <Button variant="outline">Back to website</Button>
          </Link>
          <Button variant="secondary" onClick={() => void onSignOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </div>
  )
}

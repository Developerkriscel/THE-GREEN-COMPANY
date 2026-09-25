import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'
import type { AppRole, Profile } from '@/lib/types'

interface AuthState {
  session: Session | null
  profile: Profile | null
  loading: boolean
  role: AppRole | null
  isAdmin: boolean
  isManager: boolean
  isRep: boolean
  isCustomer: boolean
  isStaff: boolean
  isActive: boolean
  signInStaff: (email: string, password: string) => Promise<void>
  signInCustomer: (userCode: string, password: string) => Promise<void>
  signUpRep: (input: { email: string; password: string; fullName: string; phone?: string; ref?: string }) => Promise<void>
  requestPasswordReset: (email: string) => Promise<void>
  updatePassword: (password: string) => Promise<void>
  signOut: () => Promise<void>
  refreshProfile: () => Promise<void>
}

const AuthContext = createContext<AuthState | null>(null)

const PROFILE_SELECT = `
  id, role, status, full_name, email, phone, avatar_path, user_code, rank_id,
  manager_id, commission_rate, address, city, state, pincode, notes,
  approved_at, last_login_at, created_at,
  member_code, referrer_id, placement_parent_id, direct_count, team_count, frozen,
  bank_holder, bank_name, bank_account, bank_ifsc, bank_type, upi_id, pan_number, bank_updated_at,
  rank:ranks!profiles_rank_id_fkey ( id, name, seniority, own_sale_rate, description, active,
               override_pct, salary, joining_fee, req_direct, req_team, req_legs,
               req_rank_sen, req_rank_count, reward_title, reward_sqyd ),
  manager:profiles!profiles_manager_id_fkey ( id, full_name ),
  referrer:profiles!profiles_referrer_id_fkey ( id, full_name, member_code )
`

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  const loadProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .maybeSingle()

    if (error) {
      console.error('[auth] profile load failed', error.message)
      setProfile(null)
      return
    }
    setProfile((data as unknown as Profile) ?? null)
  }, [])

  // Everything fetched is cached by query key, and most keys do not include
  // the member (['members'], ['profile'], ...). When the account in this tab
  // changes -- sign-out, or someone else signing in -- the previous person's
  // cached screens must not be shown to the next one, even for a moment.
  const queryClient = useQueryClient()
  const cachedFor = useRef<string | null | undefined>(undefined)
  const forgetOtherUsersData = useCallback((userId: string | null) => {
    if (cachedFor.current !== undefined && cachedFor.current !== userId) queryClient.clear()
    cachedFor.current = userId
  }, [queryClient])

  useEffect(() => {
    let alive = true

    supabase.auth.getSession().then(async ({ data, error }) => {
      if (!alive) return

      // A stored session whose refresh token is no longer valid fails its
      // refresh on every single load — a 400 in the console each time, and a
      // dead token left in storage. Clear it once so the next load starts
      // clean and the person simply sees the sign-in page.
      if (error) {
        console.warn('[auth] stored session could not be restored; clearing it', error.message)
        await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
        setSession(null)
        setProfile(null)
        setLoading(false)
        return
      }

      forgetOtherUsersData(data.session?.user?.id ?? null)
      setSession(data.session)
      if (data.session?.user) await loadProfile(data.session.user.id)
      if (alive) setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, next) => {
      if (!alive) return
      forgetOtherUsersData(next?.user?.id ?? null)
      setSession(next)
      if (next?.user) {
        await loadProfile(next.user.id)
      } else {
        setProfile(null)
      }
      setLoading(false)
    })

    return () => {
      alive = false
      sub.subscription.unsubscribe()
    }
  }, [loadProfile, forgetOtherUsersData])

  const signInStaff = useCallback(async (email: string, password: string) => {
    // Clear a stale session first: its expired token would otherwise be sent
    // as the Authorization header on the very requests that follow sign-in,
    // producing 401s that look like bad credentials.
    await supabase.auth.signOut({ scope: 'local' }).catch(() => {})
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password })
    if (error) throw new Error(error.message)
  }, [])

  // Customers log in with the User ID issued at booking. The RPC resolves it to
  // the synthetic auth email, and only ever for role='customer' accounts.
  const signInCustomer = useCallback(async (userCode: string, password: string) => {
    const { data, error } = await supabase.rpc('resolve_customer_login', {
      p_user_code: userCode.trim(),
    })
    if (error || !data) throw new Error('Invalid User ID or password')

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: data as string,
      password,
    })
    if (signInError) throw new Error('Invalid User ID or password')
  }, [])

  // Self-registration always lands as an inactive rep. The server-side trigger
  // sets role + status; nothing here can elevate an account.
  //
  // `ref` is the sponsor's member code from a referral link. It is passed as
  // metadata and resolved server-side in app.handle_new_user() — the browser
  // never gets to name a sponsor id directly, and an unknown code simply
  // results in no sponsor rather than a failed signup.
  const signUpRep = useCallback(
    async ({ email, password, fullName, phone, ref }: { email: string; password: string; fullName: string; phone?: string; ref?: string }) => {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            phone: phone?.trim(),
            ...(ref?.trim() ? { ref: ref.trim().toUpperCase() } : {}),
          },
        },
      })
      if (error) throw new Error(error.message)
    },
    [],
  )

  const requestPasswordReset = useCallback(async (email: string) => {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    })
    if (error) throw new Error(error.message)
  }, [])

  const updatePassword = useCallback(async (password: string) => {
    const { error } = await supabase.auth.updateUser({ password })
    if (error) throw new Error(error.message)
  }, [])

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    setProfile(null)
    setSession(null)
    forgetOtherUsersData(null)
  }, [forgetOtherUsersData])

  const refreshProfile = useCallback(async () => {
    if (session?.user) await loadProfile(session.user.id)
  }, [session, loadProfile])

  const value = useMemo<AuthState>(() => {
    const role = profile?.role ?? null
    const isActive = profile?.status === 'active'
    return {
      session,
      profile,
      loading,
      role,
      isAdmin: role === 'admin' && isActive,
      isManager: role === 'manager' && isActive,
      isRep: role === 'rep' && isActive,
      isCustomer: role === 'customer' && isActive,
      isStaff: (role === 'admin' || role === 'manager' || role === 'rep') && isActive,
      isActive,
      signInStaff,
      signInCustomer,
      signUpRep,
      requestPasswordReset,
      updatePassword,
      signOut,
      refreshProfile,
    }
  }, [
    session,
    profile,
    loading,
    signInStaff,
    signInCustomer,
    signUpRep,
    requestPasswordReset,
    updatePassword,
    signOut,
    refreshProfile,
  ])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>')
  return ctx
}

/**
 * Where a signed-in user belongs after login.
 *
 * A network member signs in as `rep` and lands in the Sponsor Panel — that is
 * their business. The older single-level sales workspace at /app is still
 * reachable by URL for the booking/lead workflow, but it is no longer home.
 */
/**
 * Where a signed-in account belongs.
 *
 * The business runs exactly two panels: the office works in /admin, members
 * work in /sponsor. The `manager` and `customer` roles still exist in the
 * database because ~100 RLS policies reference them, but they have no panel,
 * so they land on the public site. They must NOT be pointed at /admin: the
 * admin routes are admin-only, and RequireAuth would bounce them straight
 * back here, spinning a redirect loop.
 */
export function homeRouteFor(role: AppRole | null | undefined) {
  switch (role) {
    case 'admin':
      return '/admin'
    case 'rep':
      return '/sponsor'
    default:
      return '/'
  }
}

import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { homeRouteFor } from '../../context/AuthContext'
import type { AppRole } from '../../lib/types'
import { AuthLayout } from './AuthLayout'

type Tab = 'login' | 'signup'

export function CustomerLogin() {
  const navigate = useNavigate()
  const [tab, setTab] = useState<Tab>('login')

  // Login state
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Signup state
  const [signupName, setSignupName] = useState('')
  const [signupPhone, setSignupPhone] = useState('')
  const [signupSponsorId, setSignupSponsorId] = useState('')
  const [signupLoading, setSignupLoading] = useState(false)
  const [signupError, setSignupError] = useState<string | null>(null)
  const [signupSuccess, setSignupSuccess] = useState(false)

  const BAD_CREDENTIALS = 'Invalid Sponsor ID or password'

  /**
   * A wrong ID and a wrong password must look identical, so the page cannot be
   * used to discover which IDs exist. But a server that is unreachable, a
   * rejected API key or a 500 are NOT credential problems, and showing
   * "Invalid Sponsor ID or password" for those sends people to reset a password
   * that was never wrong. Those are reported as what they are.
   */
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      // Drop any half-dead session before signing in.
      //
      // supabase-js sends the stored session's access token as the
      // Authorization header instead of the anon key. A tab that was signed in
      // earlier and whose token has since expired therefore sends an expired
      // Bearer on this very lookup, the gateway answers 401, and the page used
      // to report that as "Invalid Sponsor ID or password" — sending people to
      // reset a password that was never wrong.
      await supabase.auth.signOut({ scope: 'local' }).catch(() => {})

      // Resolve whatever the person knows themselves by — Sponsor ID, email or
      // mobile — to the sign-in email.
      const { data: email, error: rpcErr } = await supabase.rpc('resolve_login_identifier', {
        p_id: userId.trim(),
      })

      if (rpcErr) {
        // eslint-disable-next-line no-console
        console.error('[login] identifier lookup failed', rpcErr)
        const msg = String(rpcErr.message ?? '')
        if (/failed to fetch|networkerror|load failed/i.test(msg)) {
          throw new Error(
            'Cannot reach the server. Check that the API gateway is running, then try again.',
          )
        }
        if (/jwt|api key|unauthor|forbidden/i.test(msg)) {
          throw new Error('This app is not configured correctly for the server. Contact the office.')
        }
        // The function raises "Invalid Sponsor ID" for an unknown identifier —
        // that one is a credential answer, not a fault.
        if (!/invalid sponsor id/i.test(msg)) {
          throw new Error(`Sign-in failed: ${msg}`)
        }
        throw new Error(BAD_CREDENTIALS)
      }
      if (!email) throw new Error(BAD_CREDENTIALS)

      const { error: signInErr } = await supabase.auth.signInWithPassword({
        email: email as string,
        password,
      })
      if (signInErr) {
        // eslint-disable-next-line no-console
        console.error('[login] password sign-in failed', signInErr)
        const msg = String(signInErr.message ?? '')
        if (/failed to fetch|networkerror|load failed/i.test(msg)) {
          throw new Error('Cannot reach the server. Check your connection and try again.')
        }
        throw new Error(BAD_CREDENTIALS)
      }

      // Members and customers both sign in here, so send them to their own
      // area rather than assuming the customer portal.
      const { data: session } = await supabase.auth.getUser()
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user?.id ?? '')
        .maybeSingle()
      navigate(homeRouteFor((profile?.role as AppRole) ?? 'customer'))
    } catch (err: any) {
      setError(err?.message ?? BAD_CREDENTIALS)
    } finally {
      setLoading(false)
    }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault()
    setSignupError(null)
    setSignupLoading(true)
    try {
      const { error: rpcErr } = await supabase.rpc('register_customer_inquiry', {
        p_name: signupName,
        p_phone: signupPhone,
        p_sponsor_id: signupSponsorId || null,
      })
      if (rpcErr) throw rpcErr
      setSignupSuccess(true)
    } catch (err: any) {
      setSignupError(err.message ?? 'Registration failed. Please try again.')
    } finally {
      setSignupLoading(false)
    }
  }

  return (
    <AuthLayout
      title="Sponsor Sign-in"
      subtitle="Welcome back to Royal Green Network"
    >
      {/* Tabs */}
      <div className="flex rounded-lg bg-gray-100 p-1 mb-7">
        {(['login', 'signup'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => { setTab(t); setError(null); setSignupError(null) }}
            className={`flex-1 py-2 rounded-md text-sm font-semibold transition-all ${
              tab === t
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {t === 'login' ? 'Login' : 'Sign Up'}
          </button>
        ))}
      </div>

      {/* ── Login Form ── */}
      {tab === 'login' && (
        <form onSubmit={handleLogin} className="space-y-5">
          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
              Sponsor ID <span className="text-gray-400 normal-case font-normal">— or your email / mobile</span>
            </label>
            <input
              type="text"
              autoComplete="username"
              required
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="e.g. RGC100005"
              className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[oklch(62%_.19_43)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[oklch(62%_.19_43)]/20 transition-all"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500">
                Password
              </label>
              <Link to="/forgot-password" className="text-xs font-medium text-[oklch(54%_.19_40)] hover:text-[oklch(62%_.19_43)]">
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 pr-10 text-sm text-gray-900 placeholder-gray-400 focus:border-[oklch(62%_.19_43)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[oklch(62%_.19_43)]/20 transition-all"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600"
                tabIndex={-1}
              >
                {showPw ? (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" />
                  </svg>
                ) : (
                  <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg py-3 text-sm font-bold text-white shadow-elegant disabled:opacity-60 transition-all focus:outline-none focus:ring-2 focus:ring-[oklch(62%_.19_43)]/40"
            style={{ background: 'linear-gradient(135deg, oklch(68% .18 48) 0%, oklch(54% .19 40) 100%)' }}
          >
            {loading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Signing in…
              </span>
            ) : (
              'Login to Dashboard'
            )}
          </button>
        </form>
      )}

      {/* ── Sign Up Form ── */}
      {tab === 'signup' && (
        signupSuccess ? (
          <div className="text-center py-4">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-green-100">
              <svg className="h-7 w-7 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-gray-900 mb-2">Registration Submitted!</h3>
            <p className="text-sm text-gray-500 mb-5">
              Your inquiry has been received. Our team will contact you within 24 hours with your Sponsor ID.
            </p>
            <button
              onClick={() => { setSignupSuccess(false); setTab('login') }}
              className="text-sm font-semibold text-[oklch(54%_.19_40)] hover:text-[oklch(62%_.19_43)]"
            >
              ← Back to Login
            </button>
          </div>
        ) : (
          <form onSubmit={handleSignup} className="space-y-5">
            {signupError && (
              <div className="rounded-lg bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {signupError}
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Full Name
              </label>
              <input
                type="text"
                required
                value={signupName}
                onChange={(e) => setSignupName(e.target.value)}
                placeholder="Your full name"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[oklch(62%_.19_43)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[oklch(62%_.19_43)]/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Phone Number
              </label>
              <input
                type="tel"
                required
                value={signupPhone}
                onChange={(e) => setSignupPhone(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[oklch(62%_.19_43)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[oklch(62%_.19_43)]/20 transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                Sponsor ID <span className="text-gray-400 normal-case font-normal">(optional)</span>
              </label>
              <input
                type="text"
                value={signupSponsorId}
                onChange={(e) => setSignupSponsorId(e.target.value)}
                placeholder="Referred by (Sponsor ID)"
                className="w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-[oklch(62%_.19_43)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[oklch(62%_.19_43)]/20 transition-all"
              />
            </div>

            <button
              type="submit"
              disabled={signupLoading}
              className="w-full rounded-lg py-3 text-sm font-bold text-white shadow-elegant disabled:opacity-60 transition-all focus:outline-none focus:ring-2 focus:ring-[oklch(62%_.19_43)]/40"
              style={{ background: 'linear-gradient(135deg, oklch(68% .18 48) 0%, oklch(54% .19 40) 100%)' }}
            >
              {signupLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                  Submitting…
                </span>
              ) : (
                'Register as Sponsor'
              )}
            </button>
          </form>
        )
      )}

      <div className="mt-6 text-center">
        <p className="text-sm text-gray-500">
          Admin?{' '}
          <Link to="/admin-login" className="font-semibold text-[oklch(54%_.19_40)] hover:text-[oklch(62%_.19_43)]">
            Admin Login →
          </Link>
        </p>
      </div>
    </AuthLayout>
  )
}

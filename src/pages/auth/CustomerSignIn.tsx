import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Eye, EyeOff, Loader2 } from 'lucide-react'
import { AuthLayout } from './AuthLayout'
import { useAuth } from '@/context/AuthContext'
import { BRAND } from '@/lib/brand'

/**
 * Plot buyers sign in to the customer panel with the customer ID the office
 * gave them (RG-C-…), their mobile number or their e-mail, and their password.
 */
export function CustomerSignIn() {
  const navigate = useNavigate()
  const { signInCustomer } = useAuth()
  const [id, setId] = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await signInCustomer(id, password)
      navigate('/customer')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const field = 'w-full rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder-gray-400 focus:border-brand-gold-dark focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-gold/25 transition-all'

  return (
    <AuthLayout badge="Customer Portal" title="Customer Sign-in" subtitle={`Your plots, payments and papers with ${BRAND.short}`}>
      <form onSubmit={submit} className="space-y-5">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">
            Customer ID <span className="font-normal normal-case tracking-normal text-gray-400">— or your mobile / e-mail</span>
          </label>
          <input required value={id} onChange={(e) => setId(e.target.value)} placeholder="e.g. RG-C-2026-00123" autoComplete="username" className={field} />
        </div>

        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-gray-500">Password</label>
          <div className="relative">
            <input
              type={showPw ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••" autoComplete="current-password" className={`${field} pr-10`}
            />
            <button type="button" tabIndex={-1} onClick={() => setShowPw(!showPw)} className="absolute inset-y-0 right-3 flex items-center text-gray-400 hover:text-gray-600" aria-label="Show password">
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1.5 text-xs text-gray-500">Forgot it? Call the office on {BRAND.phone} and they will reset it.</p>
        </div>

        <button type="submit" disabled={loading} className="btn-gold w-full rounded-lg py-3 text-sm">
          {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</> : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-gray-500">
        Are you a sponsor? <Link to="/sponsor-login" className="font-semibold text-brand-primary-dark hover:text-brand-primary">Sponsor Login →</Link>
      </p>
    </AuthLayout>
  )
}

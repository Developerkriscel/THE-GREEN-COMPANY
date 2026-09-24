import { useEffect, useState, type FormEvent } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Info, UserCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { supabase } from '@/lib/supabase'
import { AuthLayout } from '@/pages/auth/AuthLayout'
import { Button, Checkbox, ErrorState, Field, Input } from '@/components/ui'

/**
 * Open self-registration for network members.
 *
 * The account is created INACTIVE: the database trigger forces role='rep',
 * status='pending'. Nothing submitted here can elevate an account.
 *
 * A referral link carries `?ref=RGC1000xx`. The code is shown back to the
 * joiner as their sponsor's name so they can see who introduced them, and it
 * travels as sign-up metadata — app.handle_new_user() resolves it server-side,
 * so the browser never names a sponsor id directly and an unknown code simply
 * means no sponsor rather than a failed registration.
 */
export function RegisterRep() {
  const { signUpRep } = useAuth()
  const [params] = useSearchParams()
  const ref = (params.get('ref') ?? '').trim().toUpperCase()

  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sponsor, setSponsor] = useState<{ member_code: string; full_name: string } | null>(null)
  const [sponsorChecked, setSponsorChecked] = useState(!ref)

  useEffect(() => {
    if (!ref) return
    let alive = true
    void (async () => {
      const { data } = await supabase.rpc('sponsor_by_code', { p_code: ref })
      if (!alive) return
      const row = (Array.isArray(data) ? data[0] : data) as typeof sponsor
      setSponsor(row ?? null)
      setSponsorChecked(true)
    })()
    return () => {
      alive = false
    }
  }, [ref])

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = String(form.get('password'))

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }
    if (password !== String(form.get('confirm'))) {
      setError('The two passwords do not match.')
      return
    }

    setError(null)
    setBusy(true)
    try {
      await signUpRep({
        email: String(form.get('email')),
        password,
        fullName: String(form.get('full_name')),
        phone: String(form.get('phone') ?? ''),
        ref: sponsor?.member_code,
      })
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
    } finally {
      setBusy(false)
    }
  }

  if (done) {
    return (
      <AuthLayout title="Registration received" subtitle="One more step before you can sign in.">
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
          <CheckCircle2 className="h-6 w-6 text-brand-700" />
          <p className="mt-2 text-sm font-medium text-brand-900">Check your email</p>
          <p className="mt-1 text-sm text-brand-800">
            Confirm your email address, then wait for the office to activate your account. You will be
            notified as soon as it is approved.
            {sponsor && (
              <>
                {' '}
                You will join <strong>{sponsor.full_name}</strong>’s team.
              </>
            )}
          </p>
        </div>
        <Link to="/sponsor-login" className="mt-6 block">
          <Button variant="outline" className="w-full">
            Back to sign in
          </Button>
        </Link>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title="Join the network"
      subtitle="Register as a Royal Symo member and start building your own team."
      footer={
        <>
          Already registered?{' '}
          <Link to="/sponsor-login" className="font-medium text-brand-700 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorState error={error} />}

        {/* Who introduced you — shown before anything is typed. */}
        {ref && sponsorChecked && (
          sponsor ? (
            <div className="flex items-start gap-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3">
              <UserCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              <p className="text-sm text-emerald-900">
                You’re joining <strong>{sponsor.full_name}</strong>’s team
                <span className="ml-1 font-mono text-xs text-emerald-700">{sponsor.member_code}</span>
              </p>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <p className="text-sm text-amber-900">
                We could not find the member behind that link ({ref}). You can still register — the
                office will place you.
              </p>
            </div>
          )
        )}

        <Field label="Full name" required>
          <Input name="full_name" required autoComplete="name" placeholder="Your full name" />
        </Field>
        <Field label="Email" required>
          <Input name="email" type="email" required autoComplete="email" placeholder="you@example.com" />
        </Field>
        <Field label="Mobile number">
          <Input name="phone" inputMode="tel" autoComplete="tel" placeholder="10-digit mobile" />
        </Field>
        <Field label="Password" hint="At least 8 characters." required>
          <Input name="password" type="password" required autoComplete="new-password" minLength={8} />
        </Field>
        <Field label="Confirm password" required>
          <Input name="confirm" type="password" required autoComplete="new-password" minLength={8} />
        </Field>

        <Checkbox
          name="terms"
          required
          label={
            <>
              I agree to the{' '}
              <Link to="/page/terms" className="text-brand-700 hover:underline" target="_blank">
                Terms &amp; Conditions
              </Link>
              .
            </>
          }
        />

        <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs text-slate-600">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
          <span>
            Your account is reviewed by the office before it is activated. Income is credited after the
            company confirms a sale, with TDS and the admin charge applied as per company rules.
          </span>
        </div>

        <Button type="submit" className="w-full" loading={busy}>
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}

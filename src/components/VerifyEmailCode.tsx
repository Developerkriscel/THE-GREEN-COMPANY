import { useEffect, useRef, useState, type FormEvent } from 'react'
import { MailCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button } from '@/components/ui'

/**
 * The six-digit code step, shared by sign-up and by a sign-in that bounces
 * off an unconfirmed address.
 *
 * On success the gateway issues a session, so the member is signed in by the
 * time `onVerified` runs — a pending account then lands on the "awaiting
 * approval" screen rather than back at a login form.
 *
 * A code rather than a link: a member who signs up on a laptop and opens the
 * mail on their phone can still finish, which a link would not allow.
 */

const RESEND_SECONDS = 60

export function VerifyEmailCode({
  email,
  onVerified,
  sentOnMount = true,
}: {
  email: string
  onVerified: () => void
  /** False when arriving from sign-in, where no code has been sent yet. */
  sentOnMount?: boolean
}) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(
    sentOnMount ? `We sent a 6-digit code to ${email}.` : null,
  )
  const [cooldown, setCooldown] = useState(sentOnMount ? RESEND_SECONDS : 0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  const digits = code.replace(/\D/g, '').slice(0, 6)

  async function verify(e: FormEvent) {
    e.preventDefault()
    if (digits.length !== 6) return
    setBusy(true)
    setError(null)
    const { error: err } = await supabase.auth.verifyOtp({ email, token: digits, type: 'signup' })
    setBusy(false)
    if (err) {
      setError(err.message)
      setCode('')
      inputRef.current?.focus()
      return
    }
    onVerified()
  }

  async function resend() {
    setError(null)
    setInfo(null)
    const { error: err } = await supabase.auth.resend({ type: 'signup', email })
    if (err) {
      setError(err.message)
      return
    }
    setInfo(`A new code is on its way to ${email}. Only the newest code works.`)
    setCooldown(RESEND_SECONDS)
  }

  return (
    <form onSubmit={verify} className="space-y-4">
      <div className="flex items-start gap-3 rounded-lg border border-brand-200 bg-brand-50 p-4">
        <MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-700" />
        <div className="text-sm text-brand-900">
          <p className="font-medium">Confirm your email address</p>
          <p className="mt-0.5 text-brand-800">
            {info ?? `Enter the 6-digit code we send to ${email}.`} It expires in 10 minutes.
          </p>
        </div>
      </div>

      {/* A native input: the shared <Input> does not forward refs, and the
          field has to take focus as soon as the step appears. */}
      <input
        ref={inputRef}
        value={digits}
        onChange={(e) => setCode(e.target.value)}
        inputMode="numeric"
        autoComplete="one-time-code"
        placeholder="••••••"
        aria-label="6-digit verification code"
        className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2.5 text-center font-mono text-2xl tracking-[0.5em] text-slate-900 placeholder:text-slate-300 focus:border-brand-600 focus:outline-none focus:ring-2 focus:ring-brand-100"
        maxLength={6}
      />

      {error && <p className="text-sm text-red-600">{error}</p>}

      <Button type="submit" className="w-full" loading={busy} disabled={digits.length !== 6}>
        Verify and continue
      </Button>

      <p className="text-center text-sm text-slate-500">
        Did not get it? Check your spam folder, or{' '}
        <button
          type="button"
          onClick={() => void resend()}
          disabled={cooldown > 0}
          className="font-medium text-brand-700 hover:underline disabled:cursor-not-allowed disabled:text-slate-400 disabled:no-underline"
        >
          {cooldown > 0 ? `send another in ${cooldown}s` : 'send a new code'}
        </button>
      </p>
    </form>
  )
}

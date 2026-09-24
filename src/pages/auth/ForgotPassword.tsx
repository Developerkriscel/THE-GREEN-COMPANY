import { useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { MailCheck } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { AuthLayout } from '@/pages/auth/AuthLayout'
import { Button, ErrorState, Field, Input } from '@/components/ui'

export function ForgotPassword() {
  const { requestPasswordReset } = useAuth()
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    setError(null)
    setBusy(true)
    try {
      await requestPasswordReset(String(form.get('email')))
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the reset link')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Reset your password"
      subtitle="We will email you a link to set a new password."
      footer={
        <Link to="/sponsor-login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      {sent ? (
        <div className="rounded-lg border border-brand-200 bg-brand-50 p-4">
          <MailCheck className="h-6 w-6 text-brand-700" />
          <p className="mt-2 text-sm text-brand-900">
            If that address belongs to an account, a reset link is on its way. The link expires in one hour.
          </p>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4">
          {error && <ErrorState error={error} />}
          <Field label="Email" required>
            <Input name="email" type="email" required autoComplete="email" />
          </Field>
          <Button type="submit" className="w-full" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}

import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, homeRouteFor } from '@/context/AuthContext'
import { AuthLayout } from '@/pages/auth/AuthLayout'
import { Button, ErrorState, Field, Input } from '@/components/ui'

export function ResetPassword() {
  const { updatePassword, profile, session } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    const form = new FormData(e.currentTarget)
    const password = String(form.get('password'))

    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== String(form.get('confirm'))) return setError('The two passwords do not match.')

    setError(null)
    setBusy(true)
    try {
      await updatePassword(password)
      navigate(homeRouteFor(profile?.role), { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password')
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthLayout
      title="Set a new password"
      subtitle={
        session
          ? 'Choose a password you have not used before.'
          : 'Open the link from your email on this device to continue.'
      }
      footer={
        <Link to="/sponsor-login" className="font-medium text-brand-700 hover:underline">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorState error={error} />}
        <Field label="New password" hint="At least 8 characters." required>
          <Input name="password" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <Field label="Confirm new password" required>
          <Input name="confirm" type="password" required minLength={8} autoComplete="new-password" />
        </Field>
        <Button type="submit" className="w-full" loading={busy} disabled={!session}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  )
}

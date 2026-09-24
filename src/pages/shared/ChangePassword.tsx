import { useState, type FormEvent } from 'react'
import { KeyRound } from 'lucide-react'
import { Button, Card, CardBody, ErrorState, Field, Input, PageHeader, useToast } from '@/components/ui'
import { useAuth } from '@/context/AuthContext'

export function ChangePasswordPage() {
  const { updatePassword } = useAuth()
  const toast = useToast()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (next.length < 6) return setError('New password must be at least 6 characters.')
    if (next !== confirm) return setError('The two passwords do not match.')
    setLoading(true)
    try {
      await updatePassword(next)
      toast.push('success', 'Password updated')
      setCurrent(''); setNext(''); setConfirm('')
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Change Password" description="Use a strong password you don't reuse elsewhere." />
      <Card>
        <CardBody>
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
              <KeyRound className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-slate-900">Update your password</p>
              <p className="text-xs text-slate-500">Minimum 6 characters.</p>
            </div>
          </div>
          <form onSubmit={onSubmit} className="space-y-4">
            {error && <ErrorState error={error} />}
            <Field label="Current password">
              <Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" placeholder="••••••••" />
            </Field>
            <Field label="New password" required>
              <Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" placeholder="••••••••" />
            </Field>
            <Field label="Confirm new password" required>
              <Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" placeholder="••••••••" />
            </Field>
            <Button type="submit" loading={loading}>Update password</Button>
          </form>
        </CardBody>
      </Card>
    </div>
  )
}

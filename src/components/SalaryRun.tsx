import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { useCreditSalary } from '@/lib/queries'
import { Button, useToast } from '@/components/ui'

/**
 * Credits every active member the monthly salary of the rank they hold
 * (Business Settings → Rank plan → Salary / mo), less TDS and admin charge.
 * Safe to press again: a member is paid once per month.
 */
export function SalaryRun({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const run = useCreditSalary()
  const { push } = useToast()
  const [asked, setAsked] = useState(false)
  const month = new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  if (asked) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-brand-gold/10 px-2 py-1 text-xs text-brand-darker">
        Credit {month} salary to every qualifying member?
        <Button size="sm" loading={run.isPending} onClick={() => run.mutate(undefined, {
          onSuccess: (n) => { push('success', n ? `${month} salary credited to ${n} member${n === 1 ? '' : 's'}.` : `Nothing to credit — everyone due has been paid for ${month}.`); setAsked(false) },
          onError: (e) => push('error', (e as Error).message),
        })}>Yes, credit</Button>
        <Button size="sm" variant="ghost" onClick={() => setAsked(false)}>Cancel</Button>
      </span>
    )
  }
  return (
    <Button size={size} variant="outline" onClick={() => setAsked(true)}>
      <Wallet className="h-4 w-4" /> Credit {month} salary
    </Button>
  )
}

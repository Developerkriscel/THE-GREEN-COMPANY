import { useState } from 'react'
import { Wallet } from 'lucide-react'
import { useCreditSalary } from '@/lib/queries'
import { Button, useToast } from '@/components/ui'

/**
 * Credits the monthly bonus / incentive (deck slide 9) for the month just
 * ended: each member gets their rank's bonus if that month's team and own
 * sales met the rank's targets, less TDS and admin charge. Safe to press
 * again: a member is paid once per month.
 */
export function SalaryRun({ size = 'sm' }: { size?: 'sm' | 'md' }) {
  const run = useCreditSalary()
  const { push } = useToast()
  const [asked, setAsked] = useState(false)
  const now = new Date()
  const month = new Date(now.getFullYear(), now.getMonth() - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })

  if (asked) {
    return (
      <span className="inline-flex flex-wrap items-center gap-2 rounded-lg bg-brand-gold/10 px-2 py-1 text-xs text-brand-darker">
        Credit the {month} bonus to every member whose {month} sales met their target?
        <Button size="sm" loading={run.isPending} onClick={() => run.mutate(undefined, {
          onSuccess: (n) => { push('success', n ? `${month} bonus credited to ${n} member${n === 1 ? '' : 's'}.` : `Nothing to credit for ${month} — everyone who qualified has been paid, or no one met their target.`); setAsked(false) },
          onError: (e) => push('error', (e as Error).message),
        })}>Yes, credit</Button>
        <Button size="sm" variant="ghost" onClick={() => setAsked(false)}>Cancel</Button>
      </span>
    )
  }
  return (
    <Button size={size} variant="outline" onClick={() => setAsked(true)}>
      <Wallet className="h-4 w-4" /> Credit {month} bonus
    </Button>
  )
}

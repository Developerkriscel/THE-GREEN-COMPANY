import { useMemo, useState } from 'react'
import clsx from 'clsx'
import { Search, Shuffle, UserCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Button, Field, Input, Modal, Select, useToast } from '@/components/ui'
import { num } from '@/lib/format'

/**
 * Hand selected leads to one member, or share them out evenly (round-robin)
 * among several. The database function assign_leads does the move, writes
 * each lead's history and sends every member one notification.
 */
export function AssignLeads({
  leadIds, members, onClose, onDone,
}: {
  leadIds: string[]
  members: { id: string; label: string }[]
  onClose: () => void
  onDone: () => void
}) {
  const [mode, setMode] = useState<'one' | 'share'>('one')
  const [one, setOne] = useState('')
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { push } = useToast()

  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? members.filter((m) => m.label.toLowerCase().includes(s)) : members
  }, [members, q])

  const targets = mode === 'one' ? (one ? [one] : []) : members.filter((m) => picked.has(m.id)).map((m) => m.id)
  const each = targets.length ? leadIds.length / targets.length : 0

  async function submit() {
    setBusy(true); setError(null)
    const { data, error: rpcErr } = await supabase.rpc('assign_leads', { p_lead_ids: leadIds, p_member_ids: targets })
    setBusy(false)
    if (rpcErr) { setError(rpcErr.message); return }
    const r = data as { assigned: number; unchanged: number; skipped_converted: number }
    const extra = [
      r.unchanged ? `${num(r.unchanged)} already with that member` : '',
      r.skipped_converted ? `${num(r.skipped_converted)} converted (left as they are)` : '',
    ].filter(Boolean).join(' · ')
    push('success', `${num(r.assigned)} lead${r.assigned === 1 ? '' : 's'} assigned. Each member has been notified.${extra ? ` ${extra}.` : ''}`)
    onDone()
  }

  const toggle = (id: string) => setPicked((p) => {
    const n = new Set(p)
    n.has(id) ? n.delete(id) : n.add(id)
    return n
  })

  return (
    <Modal
      open
      onClose={busy ? () => {} : onClose}
      title={`Assign ${num(leadIds.length)} lead${leadIds.length === 1 ? '' : 's'}`}
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-slate-500">
            {targets.length > 1 ? `About ${num(Math.floor(each))}–${num(Math.ceil(each))} each` : targets.length === 1 ? 'All to one member' : 'Choose who gets them'}
          </p>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
            <Button onClick={() => void submit()} loading={busy} disabled={!targets.length}>Assign</Button>
          </div>
        </div>
      }
    >
      {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="mb-4 grid grid-cols-2 gap-2">
        {([
          ['one', UserCheck, 'One member', 'All selected leads to one sponsor'],
          ['share', Shuffle, 'Share out evenly', 'Round-robin among several sponsors'],
        ] as const).map(([k, Icon, title, sub]) => (
          <button
            key={k}
            type="button"
            onClick={() => setMode(k)}
            className={clsx(
              'rounded-2xl border p-3 text-left transition',
              mode === k ? 'border-brand-gold-dark bg-brand-gold/10 ring-1 ring-brand-gold/40' : 'border-slate-200 hover:bg-slate-50',
            )}
          >
            <Icon className={clsx('mb-1.5 h-5 w-5', mode === k ? 'text-brand-gold-deep' : 'text-slate-400')} />
            <p className="text-sm font-semibold text-brand-darker">{title}</p>
            <p className="text-xs text-slate-500">{sub}</p>
          </button>
        ))}
      </div>

      {mode === 'one' ? (
        <Field label="Member">
          <Select value={one} onChange={(e) => setOne(e.target.value)}>
            <option value="">Choose a sponsor…</option>
            {members.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </Select>
        </Field>
      ) : (
        <div>
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input className="pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search members by name or ID" />
          </div>
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="text-slate-500">{num(picked.size)} chosen</span>
            <span className="flex gap-3">
              <button type="button" className="font-medium text-brand-700 hover:underline" onClick={() => setPicked(new Set([...picked, ...shown.map((m) => m.id)]))}>Select all shown</button>
              <button type="button" className="font-medium text-slate-500 hover:underline" onClick={() => setPicked(new Set())}>Clear</button>
            </span>
          </div>
          <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200">
            {shown.map((m) => (
              <label key={m.id} className="flex cursor-pointer items-center gap-3 border-b border-slate-100 px-3 py-2 text-sm last:border-0 hover:bg-brand-gold/5">
                <input type="checkbox" checked={picked.has(m.id)} onChange={() => toggle(m.id)} className="h-4 w-4 rounded border-slate-300 text-brand-gold-dark focus:ring-brand-gold" />
                <span className="text-slate-800">{m.label}</span>
              </label>
            ))}
            {!shown.length && <p className="px-3 py-6 text-center text-sm text-slate-500">No member matches.</p>}
          </div>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-500">
        Each member gets one notification for the batch, and each lead's history records that the office assigned it.
        Converted leads are left with their sponsor.
      </p>
    </Modal>
  )
}

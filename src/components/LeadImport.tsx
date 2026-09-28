import { useMemo, useRef, useState, type DragEvent } from 'react'
import clsx from 'clsx'
import {
  CheckCircle2, ClipboardPaste, Contact, Download, FileSpreadsheet, FileText, FileType2, Link2, Loader2, Sheet, Upload,
} from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { Badge, Button, Field, Input, Modal, Select, Textarea } from '@/components/ui'
import {
  ACCEPT, FIELD_LABELS, autoMap, checkLeads, downloadSkipped, downloadTemplate, extractFromText, readImportFile,
  readWorkbook, rowsFromTable, type CheckedLead, type ImportField, type Mapping, type RawLead, type Table,
} from '@/lib/lead-import'
import { LEAD_SOURCES } from '@/lib/sponsor-crm'
import { num } from '@/lib/format'

/**
 * Import many leads at once — from Excel, CSV, Google Sheets, PDF, Word,
 * phone contacts or pasted text. Rows are checked before anything is saved:
 * a lead needs a mobile number, and a number already in the member's leads
 * (or earlier in the same file) is skipped rather than added twice.
 */

const MAX_ROWS = 2000
const CHUNK = 100
const MAP_FIELDS: ImportField[] = ['name', 'mobile', 'email', 'last_name', 'city', 'budget', 'next_follow_up', 'remark', 'source']

type Step = 'source' | 'review' | 'saving' | 'done'

const tomorrow = () => {
  const d = new Date(); d.setDate(d.getDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function LeadImport({
  ownerId, existingMobiles, projects, onClose, onImported,
}: {
  ownerId: string
  existingMobiles: string[]
  projects: { id: string; name: string }[]
  onClose: () => void
  onImported: () => void
}) {
  const [step, setStep] = useState<Step>('source')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('')

  // a sheet (mapped by column) or a list already read from text
  const [sheets, setSheets] = useState<{ name: string; table: Table }[] | null>(null)
  const [sheetIdx, setSheetIdx] = useState(0)
  const [mapping, setMapping] = useState<Mapping>({})
  const [textLeads, setTextLeads] = useState<RawLead[] | null>(null)

  const [defaults, setDefaults] = useState({ source: 'import', project_id: null as string | null, next_follow_up: tomorrow() as string | null })
  const [problemsOnly, setProblemsOnly] = useState(false)
  const [progress, setProgress] = useState(0)
  const [result, setResult] = useState<{ added: number; skipped: CheckedLead[] } | null>(null)

  const [sheetUrl, setSheetUrl] = useState('')
  const [pasted, setPasted] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const table = sheets?.[sheetIdx]?.table ?? null
  const raws = useMemo<RawLead[]>(
    () => (table ? rowsFromTable(table, mapping) : textLeads ?? []),
    [table, mapping, textLeads],
  )
  const checked = useMemo(() => checkLeads(raws.slice(0, MAX_ROWS), defaults, existingMobiles), [raws, defaults, existingMobiles])
  const ready = checked.filter((c) => c.status === 'ready')
  const dupes = checked.filter((c) => c.status === 'duplicate')
  const invalid = checked.filter((c) => c.status === 'invalid')

  function useSheets(list: { name: string; table: Table }[], from: string) {
    if (!list.length) throw new Error('No rows found in that sheet.')
    setSheets(list); setSheetIdx(0); setMapping(autoMap(list[0].table)); setTextLeads(null)
    setLabel(from); setStep('review')
  }
  function useText(list: RawLead[], from: string) {
    if (!list.length) throw new Error('No phone numbers were found. Each lead needs a mobile number.')
    setTextLeads(list); setSheets(null); setLabel(from); setStep('review')
  }

  async function run(task: () => Promise<void>) {
    setError(null); setBusy(true)
    try { await task() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  const onFile = (file: File) => run(async () => {
    const res = await readImportFile(file)
    if (res.kind === 'sheet') useSheets(res.sheets ?? [], res.label)
    else useText(res.leads ?? [], res.label)
  })

  const onSheetLink = () => run(async () => {
    const { data, error: fnErr } = await supabase.functions.invoke('fetch-sheet', { body: { url: sheetUrl } })
    if (fnErr) {
      const ctx = (fnErr as { context?: Response }).context
      const detail = ctx ? await ctx.json().catch(() => null) : null
      throw new Error(detail?.message ?? detail?.error ?? fnErr.message)
    }
    useSheets(await readWorkbook((data as { csv: string }).csv), 'Google Sheet')
  })

  const onPaste = () => run(async () => {
    // A block copied from Excel/Sheets arrives tab-separated: read it as a table.
    if (pasted.includes('\t')) useSheets(await readWorkbook(pasted), 'Pasted table')
    else useText(extractFromText(pasted), 'Pasted text')
  })

  function onDrop(e: DragEvent) {
    e.preventDefault(); setDragging(false)
    const f = e.dataTransfer.files?.[0]
    if (f) onFile(f)
  }

  async function doImport() {
    const rows = ready.map((r) => ({ ...r.lead!, owner_id: ownerId }))
    setStep('saving'); setProgress(0); setError(null)
    let added = 0
    try {
      for (let i = 0; i < rows.length; i += CHUNK) {
        const chunk = rows.slice(i, i + CHUNK)
        const { error: insErr } = await supabase.from('leads').insert(chunk)
        if (insErr) throw new Error(insErr.message)
        added += chunk.length
        setProgress(Math.round((added / rows.length) * 100))
      }
    } catch (e) {
      setError(`Stopped after ${num(added)} of ${num(rows.length)}: ${(e as Error).message}`)
    }
    setResult({ added, skipped: [...dupes, ...invalid] })
    setStep('done')
    if (added) onImported()
  }

  const shown = (problemsOnly ? checked.filter((c) => c.status !== 'ready') : checked).slice(0, 200)

  return (
    <Modal
      open
      onClose={step === 'saving' ? () => {} : onClose}
      title={step === 'done' ? 'Import finished' : 'Import leads'}
      size="lg"
      footer={
        step === 'review' ? (
          <div className="flex w-full flex-wrap items-center justify-between gap-2">
            <Button variant="ghost" onClick={() => { setStep('source'); setError(null) }}>Back</Button>
            <Button onClick={() => void doImport()} disabled={!ready.length}>
              Import {num(ready.length)} lead{ready.length === 1 ? '' : 's'}
            </Button>
          </div>
        ) : step === 'done' ? (
          <Button onClick={onClose}>Done</Button>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {step === 'source' && (
        <div className="space-y-5">
          {/* file */}
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
            onClick={() => fileRef.current?.click()}
            className={clsx(
              'flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-8 text-center transition',
              dragging ? 'border-brand-gold-dark bg-brand-gold/10' : 'border-brand-gold/40 hover:bg-brand-gold/5',
            )}
          >
            <input ref={fileRef} type="file" accept={ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = '' }} />
            <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-gold-metal text-brand-darker shadow">
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Upload className="h-5 w-5" />}
            </span>
            <p className="text-sm font-semibold text-brand-darker">{busy ? 'Reading…' : 'Drop a file here, or tap to choose'}</p>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              {[
                [FileSpreadsheet, 'Excel'], [Sheet, 'CSV'], [FileType2, 'PDF'], [FileText, 'Word'], [Contact, 'Contacts (.vcf)'], [FileText, 'Text'],
              ].map(([Icon, t]) => {
                const I = Icon as typeof Upload
                return (
                  <span key={t as string} className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[11px] font-medium text-slate-600 ring-1 ring-slate-200">
                    <I className="h-3 w-3 text-brand-gold-dark" /> {t as string}
                  </span>
                )
              })}
            </div>
            <p className="mt-3 text-xs text-slate-500">Up to 10 MB and {num(MAX_ROWS)} leads per import.</p>
          </div>

          {/* google sheet */}
          <div className="rounded-2xl border border-brand-gold/20 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-darker"><Link2 className="h-4 w-4 text-brand-gold-dark" /> Google Sheets link</p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Input value={sheetUrl} onChange={(e) => setSheetUrl(e.target.value)} placeholder="https://docs.google.com/spreadsheets/d/…" />
              <Button variant="outline" onClick={() => void onSheetLink()} disabled={busy || !sheetUrl.trim()}>Fetch sheet</Button>
            </div>
            <p className="mt-1.5 text-xs text-slate-500">In Google Sheets choose Share → “Anyone with the link” (Viewer) first.</p>
          </div>

          {/* paste */}
          <div className="rounded-2xl border border-brand-gold/20 p-4">
            <p className="mb-2 flex items-center gap-2 text-sm font-semibold text-brand-darker"><ClipboardPaste className="h-4 w-4 text-brand-gold-dark" /> Paste a list</p>
            <Textarea rows={4} value={pasted} onChange={(e) => setPasted(e.target.value)}
              placeholder={'Copy rows from Excel, or names and numbers from WhatsApp or notes:\nRahul Sharma 9876543210\nPriya Verma +91 98765 43211'} />
            <div className="mt-2 flex justify-end">
              <Button variant="outline" onClick={() => void onPaste()} disabled={busy || !pasted.trim()}>Read pasted list</Button>
            </div>
          </div>

          <button onClick={() => void downloadTemplate()} className="inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
            <Download className="h-4 w-4" /> Download an Excel template
          </button>
        </div>
      )}

      {step === 'review' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="font-semibold text-brand-darker">{label}</span>
            <Badge tone="green">{num(ready.length)} ready</Badge>
            {dupes.length > 0 && <Badge tone="amber">{num(dupes.length)} duplicate</Badge>}
            {invalid.length > 0 && <Badge tone="red">{num(invalid.length)} need a number</Badge>}
            {raws.length > MAX_ROWS && <Badge tone="red">only the first {num(MAX_ROWS)} rows</Badge>}
          </div>

          {sheets && table && (
            <div className="rounded-2xl border border-brand-gold/20 p-4">
              {sheets.length > 1 && (
                <Field label="Sheet">
                  <Select value={sheetIdx} onChange={(e) => { const i = Number(e.target.value); setSheetIdx(i); setMapping(autoMap(sheets[i].table)) }}>
                    {sheets.map((s, i) => <option key={s.name} value={i}>{s.name} ({num(s.table.rows.length)} rows)</option>)}
                  </Select>
                </Field>
              )}
              <p className="mb-2 mt-1 text-sm font-semibold text-brand-darker">Match your columns</p>
              <div className="grid gap-3 sm:grid-cols-3">
                {MAP_FIELDS.map((f) => (
                  <Field key={f} label={FIELD_LABELS[f]} required={f === 'mobile'}>
                    <Select
                      value={mapping[f] ?? ''}
                      onChange={(e) => setMapping((m) => ({ ...m, [f]: e.target.value === '' ? undefined : Number(e.target.value) }))}
                    >
                      <option value="">—</option>
                      {table.headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                    </Select>
                  </Field>
                ))}
              </div>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Source (when the file has none)">
              <Select value={defaults.source} onChange={(e) => setDefaults({ ...defaults, source: e.target.value })}>
                {['import', ...LEAD_SOURCES.filter((s) => s !== 'import')].map((s) => <option key={s} value={s}>{s.replace('_', ' ').replace(/^\w/, (c) => c.toUpperCase())}</option>)}
              </Select>
            </Field>
            <Field label="Project of interest">
              <Select value={defaults.project_id ?? ''} onChange={(e) => setDefaults({ ...defaults, project_id: e.target.value || null })}>
                <option value="">Not decided</option>
                {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </Select>
            </Field>
            <Field label="First follow-up">
              <Input type="date" value={defaults.next_follow_up ?? ''} onChange={(e) => setDefaults({ ...defaults, next_follow_up: e.target.value || null })} />
            </Field>
          </div>

          <div className="overflow-hidden rounded-2xl border border-brand-gold/20">
            <div className="flex items-center justify-between border-b border-brand-gold/15 px-4 py-2">
              <p className="text-sm font-semibold text-brand-darker">Preview</p>
              <label className="flex items-center gap-2 text-xs text-slate-600">
                <input type="checkbox" checked={problemsOnly} onChange={(e) => setProblemsOnly(e.target.checked)} className="rounded border-slate-300 text-brand-gold-dark" />
                Problems only
              </label>
            </div>
            <div className="max-h-72 overflow-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0">
                  <tr>
                    {['#', 'Name', 'Mobile', 'Email', 'Status'].map((h) => (
                      <th key={h} className="border-b border-brand-gold/25 bg-[#fbf6ea] px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-brand-gold-deep">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.row} className="border-b border-slate-100 last:border-0">
                      <td className="px-3 py-2 text-xs text-slate-400">{c.row}</td>
                      <td className="px-3 py-2 text-slate-800">{c.lead?.name ?? c.raw.name ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-slate-700">{c.lead?.mobile ?? c.raw.mobile ?? '—'}</td>
                      <td className="px-3 py-2 text-xs text-slate-500">{c.lead?.email ?? c.raw.email ?? ''}</td>
                      <td className="px-3 py-2">
                        {c.status === 'ready' ? <Badge tone="green">Ready</Badge>
                          : c.status === 'duplicate' ? <Badge tone="amber" className="whitespace-nowrap">{c.reason}</Badge>
                          : <Badge tone="red" className="whitespace-nowrap">{c.reason}</Badge>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {checked.length > shown.length && (
                <p className="px-4 py-2 text-xs text-slate-500">Showing {num(shown.length)} of {num(checked.length)} rows.</p>
              )}
            </div>
          </div>
        </div>
      )}

      {step === 'saving' && (
        <div className="py-8 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-brand-gold-dark" />
          <p className="mt-3 text-sm font-semibold text-brand-darker">Importing {num(ready.length)} leads…</p>
          <div className="mx-auto mt-4 h-2 max-w-sm overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-gold-metal transition-all" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      {step === 'done' && result && (
        <div className="py-4 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <p className="mt-3 text-lg font-bold text-brand-darker">{num(result.added)} lead{result.added === 1 ? '' : 's'} added</p>
          {result.skipped.length > 0 && (
            <>
              <p className="mt-1 text-sm text-slate-600">
                {num(result.skipped.length)} row{result.skipped.length === 1 ? ' was' : 's were'} skipped (duplicates or no valid number).
              </p>
              <button onClick={() => downloadSkipped(result.skipped)} className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-700 hover:underline">
                <Download className="h-4 w-4" /> Download the skipped rows
              </button>
            </>
          )}
          <p className="mt-4 text-xs text-slate-500">Imported leads start as “New”, with the first follow-up on the date you chose.</p>
        </div>
      )}
    </Modal>
  )
}

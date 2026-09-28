/**
 * Bulk lead import: turn whatever a member has — an Excel or CSV sheet, a
 * Google Sheet, a PDF or Word list, phone contacts (.vcf) or pasted text —
 * into leads.
 *
 * Tables are mapped column by column (the columns are guessed from their
 * headings and can be changed). Free text (PDF, Word, text, paste) is read
 * line by line for phone numbers, e-mails and the names beside them.
 *
 * This file is the pure part — parsing, mapping, checking — so it can be
 * tested without a browser. The file readers at the bottom load their
 * libraries only when a file of that kind is chosen.
 */

export type ImportField = 'name' | 'last_name' | 'mobile' | 'email' | 'budget' | 'next_follow_up' | 'remark' | 'source' | 'city'

export const FIELD_LABELS: Record<ImportField, string> = {
  name: 'Name',
  last_name: 'Last name',
  mobile: 'Mobile',
  email: 'Email',
  budget: 'Budget (₹)',
  next_follow_up: 'Next follow-up',
  remark: 'Remark / notes',
  source: 'Source',
  city: 'City',
}

/** Headings people actually use, per field (lower-case, punctuation stripped). */
const SYNONYMS: Record<ImportField, string[]> = {
  name: ['name', 'full name', 'fullname', 'customer', 'customer name', 'client', 'client name', 'lead', 'lead name', 'contact name', 'first name', 'firstname', 'prospect', 'person'],
  last_name: ['last name', 'lastname', 'surname'],
  mobile: ['mobile', 'mobile no', 'mobile number', 'phone', 'phone no', 'phone number', 'contact', 'contact no', 'contact number', 'number', 'cell', 'whatsapp', 'whatsapp no', 'whatsapp number', 'mob', 'mob no', 'tel', 'telephone'],
  email: ['email', 'e mail', 'email id', 'email address', 'mail'],
  budget: ['budget', 'amount', 'investment', 'price range'],
  next_follow_up: ['next follow up', 'follow up', 'followup', 'follow up date', 'next call', 'callback', 'call back', 'date'],
  remark: ['remark', 'remarks', 'note', 'notes', 'comment', 'comments', 'requirement', 'description', 'message'],
  source: ['source', 'lead source', 'platform', 'channel', 'from'],
  city: ['city', 'location', 'area', 'town', 'address'],
}

const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim()
const key = (s: string) => clean(s).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

/* ------------------------------------------------------------ phone numbers */

/**
 * A mobile number in a comparable form: Indian numbers as their 10 digits
 * (dropping +91, 91 or a leading 0), anything else longer as "+digits".
 * Null when there are too few digits to be a phone number.
 */
export function normalizeMobile(raw: unknown): string | null {
  const digits = String(raw ?? '').replace(/\D/g, '')
  if (digits.length === 10) return digits
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1)
  if (digits.length === 12 && digits.startsWith('91')) return digits.slice(2)
  if (digits.length > 10 && digits.length <= 15) return `+${digits}`
  return null
}

const PHONE_RE = /(?:\+?\d{1,3}[\s-]?)?(?:\d[\s-]?){9,12}\d/g
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi

/* ------------------------------------------------------------------ tables */

export interface Table {
  headers: string[]
  rows: string[][]
}

/**
 * A grid of cells as a table: the first row is taken as headings unless it
 * looks like data (it holds a phone number), in which case the columns are
 * named "Column A", "Column B"…
 */
export function toTable(matrix: unknown[][]): Table {
  const grid = matrix
    .map((r) => (r ?? []).map(clean))
    .filter((r) => r.some((c) => c !== ''))
  if (!grid.length) return { headers: [], rows: [] }
  const width = Math.max(...grid.map((r) => r.length))
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? '')
  const first = grid[0]
  const firstIsData = first.some((c) => normalizeMobile(c) && /\d{6,}/.test(c.replace(/\D/g, '')))
  const letter = (i: number) => `Column ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? Math.floor(i / 26) : ''}`
  if (firstIsData) {
    return { headers: Array.from({ length: width }, (_, i) => letter(i)), rows: grid.map(pad) }
  }
  return {
    headers: pad(first).map((h, i) => h || letter(i)),
    rows: grid.slice(1).map(pad),
  }
}

export type Mapping = Partial<Record<ImportField, number>>

/**
 * Guess which column holds each field, from the headings — and, for Mobile
 * and Email when no heading says so, from the column whose cells look like
 * phone numbers or addresses.
 */
export function autoMap(table: Table): Mapping {
  const map: Mapping = {}
  const used = new Set<number>()
  const hk = table.headers.map(key)
  const order: ImportField[] = ['mobile', 'email', 'last_name', 'name', 'budget', 'next_follow_up', 'remark', 'source', 'city']
  for (const f of order) {
    // exact synonym first, then "heading contains the synonym"
    let idx = hk.findIndex((h, i) => !used.has(i) && SYNONYMS[f].includes(h))
    if (idx < 0) idx = hk.findIndex((h, i) => !used.has(i) && SYNONYMS[f].some((s) => s.length > 3 && h.includes(s)))
    if (idx >= 0) { map[f] = idx; used.add(idx) }
  }
  const sample = table.rows.slice(0, 25)
  const share = (col: number, test: (v: string) => boolean) =>
    sample.length ? sample.filter((r) => test(r[col] ?? '')).length / sample.length : 0
  if (map.mobile === undefined) {
    const col = table.headers.findIndex((_, i) => !used.has(i) && share(i, (v) => Boolean(normalizeMobile(v))) >= 0.6)
    if (col >= 0) { map.mobile = col; used.add(col) }
  }
  if (map.email === undefined) {
    const col = table.headers.findIndex((_, i) => !used.has(i) && share(i, (v) => /@/.test(v)) >= 0.6)
    if (col >= 0) { map.email = col; used.add(col) }
  }
  if (map.name === undefined) {
    // the first remaining column of mostly letters
    const col = table.headers.findIndex((_, i) => !used.has(i) && share(i, (v) => /^[\p{L} .'-]{2,}$/u.test(v)) >= 0.6)
    if (col >= 0) { map.name = col; used.add(col) }
  }
  return map
}

/* -------------------------------------------------------------- free text */

export interface RawLead {
  name?: string
  mobile?: string
  email?: string
  budget?: string
  next_follow_up?: string
  remark?: string
  source?: string
  city?: string
}

/**
 * Leads out of free text — a PDF, a Word file, notes, a WhatsApp message.
 * Each phone number found is one lead; its name is the rest of that line or,
 * when the line holds only the number, the line above it.
 */
export function extractFromText(text: string): RawLead[] {
  const lines = text.split(/\r?\n/).map(clean).filter(Boolean)
  const out: RawLead[] = []
  lines.forEach((line, i) => {
    const phones = [...line.matchAll(PHONE_RE)].map((m) => m[0]).filter((p) => normalizeMobile(p))
    if (!phones.length) return
    const emails = line.match(EMAIL_RE) ?? []
    let rest = line
    for (const p of phones) rest = rest.replace(p, ' ')
    for (const e of emails) rest = rest.replace(e, ' ')
    let name = cleanName(rest)
    if (!name && i > 0) {
      const prev = lines[i - 1]
      if (!prev.match(PHONE_RE)?.some((p) => normalizeMobile(p))) name = cleanName(prev.replace(EMAIL_RE, ' '))
    }
    const email = emails[0] ?? (lines[i + 1]?.match(EMAIL_RE)?.[0] && !lines[i + 1].match(PHONE_RE) ? lines[i + 1].match(EMAIL_RE)![0] : undefined)
    // several numbers on a line with one name: first is the lead, the rest go in the remark
    out.push({ name, mobile: phones[0], email, remark: phones.length > 1 ? `Other numbers: ${phones.slice(1).join(', ')}` : undefined })
  })
  return out
}

function cleanName(s: string) {
  return clean(
    s
      .replace(/\b(name|mobile|mob|phone|ph|contact|no|number|whatsapp|email|tel)\b\.?\s*[:\-–]?/gi, ' ')
      .replace(/^[\s\d.)\]:-]+/, '') // list numbering: "1.", "2)", "3 -"
      .replace(/[|,;:()[\]{}<>"“”]+/g, ' '),
  )
    .replace(/^[-–.\s]+|[-–.\s]+$/g, '')
    .slice(0, 80)
}

/** Phone contacts exported as .vcf (Android and iPhone both do this). */
export function parseVcf(text: string): RawLead[] {
  const unfolded = text.replace(/\r?\n[ \t]/g, '')
  const cards = unfolded.split(/BEGIN:VCARD/i).slice(1)
  return cards.map((c) => {
    const get = (prop: string) => c.match(new RegExp(`^${prop}(?:;[^:\\n]*)?:(.*)$`, 'im'))?.[1]?.trim()
    let name = get('FN')
    if (!name) {
      const n = get('N')?.split(';') ?? []
      name = clean(`${n[1] ?? ''} ${n[0] ?? ''}`)
    }
    return {
      name: name?.replace(/\\,/g, ',').replace(/\\;/g, ';'),
      mobile: get('TEL'),
      email: get('EMAIL'),
      remark: get('NOTE'),
    }
  }).filter((r) => r.mobile)
}

/* --------------------------------------------------------- checking leads */

export interface LeadDefaults {
  source: string
  project_id: string | null
  next_follow_up: string | null
}

export interface CheckedLead {
  row: number
  raw: RawLead
  status: 'ready' | 'duplicate' | 'invalid'
  reason?: string
  lead?: {
    name: string
    mobile: string
    email: string | null
    budget: number | null
    next_follow_up: string | null
    remark: string | null
    source: string
    project_id: string | null
    status: 'new'
  }
}

export function rowsFromTable(table: Table, map: Mapping): RawLead[] {
  const at = (r: string[], f: ImportField) => (map[f] !== undefined ? clean(r[map[f]!]) : '')
  return table.rows.map((r) => ({
    name: clean(`${at(r, 'name')} ${at(r, 'last_name')}`),
    mobile: at(r, 'mobile'),
    email: at(r, 'email'),
    budget: at(r, 'budget'),
    next_follow_up: at(r, 'next_follow_up'),
    remark: at(r, 'remark'),
    source: at(r, 'source'),
    city: at(r, 'city'),
  }))
}

/** "5 lakh", "₹50,00,000", "1.2 cr" → rupees. */
export function parseBudget(v: string | undefined): number | null {
  if (!v) return null
  const s = v.toLowerCase().replace(/[,₹\s]/g, '')
  const n = parseFloat(s.replace(/[^0-9.]/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  if (/cr|crore/.test(s)) return Math.round(n * 1e7)
  if (/l|lac|lakh/.test(s)) return Math.round(n * 1e5)
  if (/k\b|k$/.test(s)) return Math.round(n * 1e3)
  return Math.round(n)
}

/** dd/mm/yyyy, yyyy-mm-dd, "12 Oct 2026", or an Excel day number → yyyy-mm-dd. */
export function parseDate(v: string | undefined): string | null {
  if (!v) return null
  const s = v.trim()
  if (/^\d{5}$/.test(s)) {
    const d = new Date(Date.UTC(1899, 11, 30) + Number(s) * 86400000)
    return d.toISOString().slice(0, 10)
  }
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s)
  if (m) return iso(+m[1], +m[2], +m[3])
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/.exec(s)
  if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]) // Indian order: day first
  const t = Date.parse(s)
  return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10)
}
function iso(y: number, mo: number, d: number) {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/**
 * Every row checked: ready, a duplicate (of an earlier row or of a lead the
 * member already has), or invalid with the reason.
 */
export function checkLeads(raws: RawLead[], defaults: LeadDefaults, existingMobiles: Iterable<string>): CheckedLead[] {
  const existing = new Set<string>()
  for (const m of existingMobiles) {
    const n = normalizeMobile(m)
    if (n) existing.add(n)
  }
  const inFile = new Set<string>()
  return raws.map((raw, i) => {
    const row = i + 1
    const mobile = normalizeMobile(raw.mobile)
    if (!mobile) return { row, raw, status: 'invalid', reason: raw.mobile ? 'Mobile number is not valid' : 'No mobile number' }
    if (existing.has(mobile)) return { row, raw, status: 'duplicate', reason: 'Already in your leads' }
    if (inFile.has(mobile)) return { row, raw, status: 'duplicate', reason: 'Repeated in this file' }
    inFile.add(mobile)
    let name = clean(raw.name)
    if (name.length < 2) name = `Lead ${mobile.slice(-4)}`
    const email = raw.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.email.trim()) ? raw.email.trim().toLowerCase() : null
    const remarkParts = [clean(raw.remark), raw.city ? `City: ${clean(raw.city)}` : ''].filter(Boolean)
    return {
      row,
      raw,
      status: 'ready',
      lead: {
        name: name.slice(0, 120),
        mobile,
        email,
        budget: parseBudget(raw.budget),
        next_follow_up: parseDate(raw.next_follow_up) ?? defaults.next_follow_up,
        remark: remarkParts.length ? remarkParts.join(' · ').slice(0, 1000) : null,
        source: clean(raw.source).toLowerCase().replace(/\s+/g, '_').slice(0, 40) || defaults.source,
        project_id: defaults.project_id,
        status: 'new' as const,
      },
    }
  })
}

/* ------------------------------------------------------------ file readers */

export type ImportKind = 'sheet' | 'text'
export interface ReadResult {
  kind: ImportKind
  /** For sheets: every sheet in the workbook. */
  sheets?: { name: string; table: Table }[]
  /** For free text and contacts: the leads found. */
  leads?: RawLead[]
  label: string
}

export const ACCEPT = '.xlsx,.xls,.xlsm,.ods,.csv,.tsv,.txt,.pdf,.docx,.vcf'
export const MAX_FILE_BYTES = 10 * 1024 * 1024

export async function readImportFile(file: File): Promise<ReadResult> {
  if (file.size > MAX_FILE_BYTES) throw new Error('That file is over 10 MB. Split it and import in parts.')
  const ext = file.name.toLowerCase().split('.').pop() ?? ''
  if (['xlsx', 'xls', 'xlsm', 'ods', 'csv', 'tsv'].includes(ext)) {
    return { kind: 'sheet', sheets: await readWorkbook(await file.arrayBuffer()), label: file.name }
  }
  if (ext === 'pdf') return { kind: 'text', leads: extractFromText(await readPdfText(file)), label: file.name }
  if (ext === 'docx') return { kind: 'text', leads: extractFromText(await readDocxText(file)), label: file.name }
  if (ext === 'vcf') return { kind: 'text', leads: parseVcf(await file.text()), label: file.name }
  if (ext === 'txt') return { kind: 'text', leads: extractFromText(await file.text()), label: file.name }
  throw new Error('That kind of file is not supported. Use Excel, CSV, PDF, Word, contacts (.vcf) or text.')
}

export async function readWorkbook(data: ArrayBuffer | string): Promise<{ name: string; table: Table }[]> {
  const XLSX = await import('xlsx')
  const wb = typeof data === 'string'
    ? XLSX.read(data, { type: 'string', raw: false })
    : XLSX.read(data, { type: 'array', cellDates: false, raw: false })
  return wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name]
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: false, defval: '', blankrows: false })
    return { name, table: toTable(matrix) }
  }).filter((s) => s.table.rows.length > 0)
}

async function readPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  const lines: string[] = []
  for (let p = 1; p <= Math.min(doc.numPages, 200); p++) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    // Rebuild lines from positioned text: same baseline = same line.
    const rows = new Map<number, { x: number; s: string }[]>()
    for (const it of content.items as { str: string; transform: number[] }[]) {
      if (!it.str?.trim()) continue
      const y = Math.round(it.transform[5])
      const row = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y
      rows.set(row, [...(rows.get(row) ?? []), { x: it.transform[4], s: it.str }])
    }
    ;[...rows.entries()].sort((a, b) => b[0] - a[0]).forEach(([, parts]) => {
      lines.push(parts.sort((a, b) => a.x - b.x).map((q) => q.s).join('  '))
    })
  }
  return lines.join('\n')
}

async function readDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth/mammoth.browser')
  const { value } = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return value
}

/** A ready-to-fill Excel template. */
export async function downloadTemplate() {
  const XLSX = await import('xlsx')
  const ws = XLSX.utils.aoa_to_sheet([
    ['Name', 'Mobile', 'Email', 'City', 'Budget', 'Next follow-up', 'Remark'],
    ['Rahul Sharma', '9876543210', 'rahul@example.com', 'Gurgaon', '5 lakh', '15/10/2026', 'Wants a 100 sq yd plot'],
    ['Priya Verma', '+91 98765 43211', '', 'Delhi', '', '', 'Call after 6 pm'],
  ])
  ws['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 24 }, { wch: 12 }, { wch: 10 }, { wch: 14 }, { wch: 30 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Leads')
  XLSX.writeFile(wb, 'lead-import-template.xlsx')
}

/** Rows that were not imported, with the reason, as a CSV download. */
export function downloadSkipped(rows: CheckedLead[]) {
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`
  const csv = [['Row', 'Name', 'Mobile', 'Email', 'Reason'].join(',')]
    .concat(rows.map((r) => [r.row, r.raw.name, r.raw.mobile, r.raw.email, r.reason].map(esc).join(',')))
    .join('\r\n')
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
  const a = document.createElement('a')
  a.href = url
  a.download = 'leads-not-imported.csv'
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

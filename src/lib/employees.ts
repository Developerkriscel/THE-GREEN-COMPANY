import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { supabase } from '@/lib/supabase'
import { shrink } from '@/lib/avatar'

/**
 * Employees: the office's HR records for the company's own staff.
 *
 * Records only -- an employee has no login and no panel (Staff manages who
 * can sign in). Every table is admin-only by row security; the one public
 * door is verify_employee(), which the QR on an ID card opens.
 * Files live in the private `hr` bucket as `<employee id>/<file>`.
 */

const BUCKET = 'hr'

export type EmployeeStatus = 'active' | 'on_notice' | 'suspended' | 'exited'
export type EmploymentType = 'full_time' | 'part_time' | 'contract' | 'intern' | 'consultant'
export type ExitType = 'resigned' | 'terminated' | 'absconded' | 'retired' | 'contract_end' | 'other'

export interface Employee {
  id: string
  employee_code: string
  full_name: string
  photo_path: string | null
  gender: 'male' | 'female' | 'other' | null
  dob: string | null
  blood_group: string | null
  marital_status: string | null
  father_name: string | null
  spouse_name: string | null
  qualification: string | null
  experience_years: number | null
  previous_employer: string | null
  phone: string | null
  alt_phone: string | null
  email: string | null
  personal_email: string | null
  current_address: string | null
  permanent_address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  department: string | null
  designation: string | null
  employment_type: EmploymentType
  work_location: string | null
  shift: string | null
  joining_date: string
  probation_end: string | null
  confirmation_date: string | null
  contract_end: string | null
  reporting_manager_id: string | null
  monthly_salary: number | null
  salary_mode: 'bank' | 'cash' | 'upi' | 'cheque'
  bank_name: string | null
  bank_account: string | null
  ifsc: string | null
  account_holder: string | null
  upi_id: string | null
  pan: string | null
  aadhaar_last4: string | null
  uan: string | null
  esic_no: string | null
  emergency_name: string | null
  emergency_relation: string | null
  emergency_phone: string | null
  status: EmployeeStatus
  notice_date: string | null
  exit_date: string | null
  exit_type: ExitType | null
  exit_reason: string | null
  fnf_settled: boolean
  fnf_amount: number | null
  rehire_eligible: boolean | null
  card_token: string
  card_issue_no: number
  card_issued_on: string
  card_valid_till: string | null
  leave_quota: Record<string, number>
  notes: string | null
  created_at: string
  updated_at: string
}

export interface EmployeeDocument {
  id: string
  employee_id: string
  doc_type: string
  title: string
  doc_number: string | null
  storage_path: string
  mime_type: string | null
  size_bytes: number | null
  expiry_date: string | null
  verified: boolean
  created_at: string
}

export type EventKind =
  | 'joined' | 'confirmed' | 'promotion' | 'transfer' | 'salary' | 'status' | 'exit' | 'card'
  | 'note' | 'appreciation' | 'warning' | 'training' | 'incident'

export interface EmployeeEvent {
  id: string
  employee_id: string
  kind: EventKind
  title: string
  detail: string | null
  event_date: string
  auto: boolean
  created_at: string
  author?: { full_name: string } | null
}

export interface EmployeeAsset {
  id: string
  employee_id: string
  asset_type: string
  name: string
  serial_no: string | null
  value: number | null
  issued_on: string
  returned_on: string | null
  condition_out: string | null
  condition_in: string | null
  notes: string | null
}

export interface EmployeeLeave {
  id: string
  employee_id: string
  leave_type: string
  from_date: string
  to_date: string
  days: number
  status: 'pending' | 'approved' | 'rejected' | 'cancelled'
  reason: string | null
  created_at: string
}

/* ------------------------------------------------------------------ labels */

export const STATUS_LABEL: Record<EmployeeStatus, string> = {
  active: 'Active',
  on_notice: 'On notice',
  suspended: 'Suspended',
  exited: 'Exited',
}
export const STATUS_TONE: Record<EmployeeStatus, 'green' | 'amber' | 'red' | 'neutral'> = {
  active: 'green',
  on_notice: 'amber',
  suspended: 'red',
  exited: 'neutral',
}
export const TYPE_LABEL: Record<EmploymentType, string> = {
  full_time: 'Full time',
  part_time: 'Part time',
  contract: 'Contract',
  intern: 'Intern',
  consultant: 'Consultant',
}
export const EXIT_LABEL: Record<ExitType, string> = {
  resigned: 'Resigned',
  terminated: 'Terminated',
  absconded: 'Absconded',
  retired: 'Retired',
  contract_end: 'Contract ended',
  other: 'Other',
}
export const DOC_TYPES: Record<string, string> = {
  aadhaar: 'Aadhaar card',
  pan: 'PAN card',
  photo_id: 'Photo ID (Voter / Passport)',
  address_proof: 'Address proof',
  resume: 'Resume / CV',
  education: 'Education certificate',
  experience: 'Experience letter',
  offer_letter: 'Offer letter',
  appointment_letter: 'Appointment letter',
  nda: 'NDA / Agreement',
  bank_proof: 'Cancelled cheque / Passbook',
  police_verification: 'Police verification',
  medical: 'Medical certificate',
  driving_licence: 'Driving licence',
  increment_letter: 'Increment letter',
  warning_letter: 'Warning letter',
  relieving_letter: 'Relieving letter',
  other: 'Other',
}
/** The papers every joiner should have on file; the profile shows what is missing. */
export const REQUIRED_DOCS = ['aadhaar', 'pan', 'resume', 'appointment_letter', 'bank_proof'] as const

export const ASSET_TYPES: Record<string, string> = {
  laptop: 'Laptop', desktop: 'Desktop', mobile: 'Mobile phone', sim: 'SIM card', tablet: 'Tablet',
  id_card: 'ID card', access_card: 'Access card', keys: 'Keys', vehicle: 'Vehicle', uniform: 'Uniform',
  tools: 'Tools / equipment', other: 'Other',
}
export const LEAVE_TYPES: Record<string, string> = {
  casual: 'Casual', sick: 'Sick', earned: 'Earned', unpaid: 'Unpaid (LOP)',
  maternity: 'Maternity', paternity: 'Paternity', comp_off: 'Comp-off', other: 'Other',
}
/** Leave types that have a yearly quota. */
export const QUOTA_TYPES = ['casual', 'sick', 'earned'] as const

export const EVENT_LABEL: Record<EventKind, string> = {
  joined: 'Joined', confirmed: 'Confirmed', promotion: 'Designation', transfer: 'Transfer', salary: 'Salary',
  status: 'Status', exit: 'Exit', card: 'ID card', note: 'Note', appreciation: 'Appreciation',
  warning: 'Warning', training: 'Training', incident: 'Incident',
}
/** What the office can add to the timeline by hand. */
export const MANUAL_EVENTS: EventKind[] = ['note', 'appreciation', 'warning', 'training', 'incident']

export const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-']

/** Departments offered before the office has typed its own. */
export const DEFAULT_DEPARTMENTS = ['Sales', 'Marketing', 'Accounts', 'Admin', 'HR', 'Operations', 'Site / Projects', 'Legal', 'IT', 'Customer Care']

/* ------------------------------------------------------------------- dates */

/**
 * The gateway returns `date` columns as a full timestamp (midnight IST in
 * UTC). Bring every one back to the plain 'YYYY-MM-DD' the forms and the
 * date maths below expect.
 */
export function ymd(v: string | null | undefined): string | null {
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : format(d, 'yyyy-MM-dd')
}
const DATE_FIELDS = ['dob', 'joining_date', 'probation_end', 'confirmation_date', 'contract_end', 'notice_date', 'exit_date', 'card_issued_on', 'card_valid_till'] as const

function normalise(e: Employee): Employee {
  const out = { ...e } as Record<string, unknown>
  for (const k of DATE_FIELDS) out[k] = ymd(out[k] as string | null)
  out.monthly_salary = e.monthly_salary === null ? null : Number(e.monthly_salary)
  out.fnf_amount = e.fnf_amount === null ? null : Number(e.fnf_amount)
  out.experience_years = e.experience_years === null ? null : Number(e.experience_years)
  return out as unknown as Employee
}

const local = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}
export const today = () => {
  const n = new Date()
  return new Date(n.getFullYear(), n.getMonth(), n.getDate())
}
/** Whole days from today to a 'YYYY-MM-DD' (negative when past). */
export function daysUntil(s: string | null | undefined) {
  if (!s) return null
  return Math.round((local(s).getTime() - today().getTime()) / 86_400_000)
}

/** Days until the next yearly return of a date (birthday, work anniversary); 0 = today. */
export function daysToNextAnniversary(s: string | null | undefined) {
  if (!s) return null
  const d = local(s)
  const t = today()
  let next = new Date(t.getFullYear(), d.getMonth(), d.getDate())
  if (next < t) next = new Date(t.getFullYear() + 1, d.getMonth(), d.getDate())
  return Math.round((next.getTime() - t.getTime()) / 86_400_000)
}

/** Years completed on the next anniversary of `s`. */
export function yearsAtNext(s: string) {
  const d = local(s)
  const t = today()
  const thisYear = new Date(t.getFullYear(), d.getMonth(), d.getDate())
  return (thisYear < t ? t.getFullYear() + 1 : t.getFullYear()) - d.getFullYear()
}

/** "2 yrs 3 mos" of service, up to the exit date for someone who left. */
export function tenure(e: Pick<Employee, 'joining_date' | 'exit_date'>) {
  const from = local(e.joining_date)
  const to = e.exit_date ? local(e.exit_date) : today()
  let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
  if (to.getDate() < from.getDate()) months -= 1
  if (months < 0) return 'Joining soon'
  const y = Math.floor(months / 12)
  const m = months % 12
  if (!y && !m) return 'Under a month'
  return [y && `${y} yr${y > 1 ? 's' : ''}`, m && `${m} mo${m > 1 ? 's' : ''}`].filter(Boolean).join(' ')
}

export function age(dob: string | null) {
  if (!dob) return null
  const d = local(dob)
  const t = today()
  return t.getFullYear() - d.getFullYear() - (t < new Date(t.getFullYear(), d.getMonth(), d.getDate()) ? 1 : 0)
}

/** Still on probation: a probation end in the future or just passed, and not yet confirmed. */
export function onProbation(e: Employee) {
  return e.status !== 'exited' && !!e.probation_end && !e.confirmation_date
}

export type CardState = 'valid' | 'expiring' | 'expired' | 'void'
export function cardState(e: Employee): CardState {
  if (e.status === 'exited' || e.status === 'suspended') return 'void'
  const left = daysUntil(e.card_valid_till)
  if (left === null) return 'valid'
  if (left < 0) return 'expired'
  return left <= 30 ? 'expiring' : 'valid'
}

export function verifyUrl(token: string) {
  return `${window.location.origin}/verify/employee/${token}`
}

/* ------------------------------------------------------------------ reads */

export function useEmployees() {
  return useQuery({
    queryKey: ['employees'],
    queryFn: async () => {
      const { data, error } = await supabase.from('employees').select('*').is('deleted_at', null).order('full_name')
      if (error) throw new Error(error.message)
      return (data as Employee[]).map(normalise)
    },
  })
}

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: ['employee', id],
    enabled: !!id,
    queryFn: async () => {
      const { data, error } = await supabase.from('employees').select('*').eq('id', id!).is('deleted_at', null).maybeSingle()
      if (error) throw new Error(error.message)
      return data ? normalise(data as Employee) : null
    },
  })
}

/** Documents, for one employee or (no id) for everyone, to raise expiry alerts. */
export function useEmployeeDocs(employeeId?: string) {
  return useQuery({
    queryKey: ['employee-docs', employeeId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('employee_documents').select('*').order('created_at', { ascending: false })
      if (employeeId) q = q.eq('employee_id', employeeId)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data as EmployeeDocument[]).map((d) => ({ ...d, expiry_date: ymd(d.expiry_date) }))
    },
  })
}

export function useEmployeeEvents(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['employee-events', employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase.from('employee_events')
        .select('*, author:profiles!employee_events_created_by_fkey ( full_name )')
        .eq('employee_id', employeeId!).order('event_date', { ascending: false }).order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data as EmployeeEvent[]).map((e) => ({ ...e, event_date: ymd(e.event_date)! }))
    },
  })
}

/** Assets, for one employee or (no id) for everyone. */
export function useEmployeeAssets(employeeId?: string) {
  return useQuery({
    queryKey: ['employee-assets', employeeId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('employee_assets').select('*').order('issued_on', { ascending: false })
      if (employeeId) q = q.eq('employee_id', employeeId)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data as EmployeeAsset[]).map((a) => ({
        ...a, issued_on: ymd(a.issued_on)!, returned_on: ymd(a.returned_on), value: a.value === null ? null : Number(a.value),
      }))
    },
  })
}

/** Leaves, for one employee or (no id) for everyone (who is on leave today). */
export function useEmployeeLeaves(employeeId?: string) {
  return useQuery({
    queryKey: ['employee-leaves', employeeId ?? 'all'],
    queryFn: async () => {
      let q = supabase.from('employee_leaves').select('*').order('from_date', { ascending: false })
      if (employeeId) q = q.eq('employee_id', employeeId)
      const { data, error } = await q
      if (error) throw new Error(error.message)
      return (data as EmployeeLeave[]).map((l) => ({ ...l, from_date: ymd(l.from_date)!, to_date: ymd(l.to_date)!, days: Number(l.days) }))
    },
  })
}

/** A short-lived link to a file in the hr bucket (photo, document). */
export function useHrFileUrl(path: string | null | undefined) {
  return useQuery({
    queryKey: ['hr-url', path],
    enabled: !!path,
    staleTime: 50 * 60 * 1000,
    queryFn: () => hrSignedUrl(path!, 3600),
  })
}

export async function hrSignedUrl(path: string, seconds = 300) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, seconds)
  if (error) throw new Error(error.message)
  const url = data?.signedUrl ?? ''
  if (/^https?:\/\//.test(url)) return url
  const base = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/$/, '')
  return `${base}/storage/v1${url.startsWith('/') ? '' : '/'}${url}`
}

export async function openHrFile(path: string) {
  // Open the tab first so a pop-up blocker sees it come from the click.
  const tab = window.open('', '_blank')
  try {
    const url = await hrSignedUrl(path)
    if (tab) tab.location.href = url
    else window.open(url, '_blank', 'noopener')
  } catch (e) {
    tab?.close()
    throw e
  }
}

/* ----------------------------------------------------------------- writes */

/** The columns the editor may write. */
export type EmployeeInput = Partial<Omit<Employee, 'id' | 'employee_code' | 'card_token' | 'card_issue_no' | 'card_issued_on' | 'created_at' | 'updated_at'>>

export function useSaveEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: EmployeeInput }) => {
      if (id) {
        const { data, error } = await supabase.from('employees').update(values).eq('id', id).select('*').single()
        if (error) throw new Error(error.message)
        return normalise(data as Employee)
      }
      const { data, error } = await supabase.from('employees').insert(values).select('*').single()
      if (error) throw new Error(error.message)
      return normalise(data as Employee)
    },
    onSuccess: (e) => {
      void qc.invalidateQueries({ queryKey: ['employees'] })
      void qc.invalidateQueries({ queryKey: ['employee', e.id] })
      void qc.invalidateQueries({ queryKey: ['employee-events', e.id] })
    },
  })
}

/** Archive (soft delete): the record leaves every list, the card stops verifying. */
export function useArchiveEmployee() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('employees').update({ deleted_at: new Date().toISOString() }).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['employees'] }),
  })
}

/** Resize in the browser, upload, and point the record at it. */
export function useUploadEmployeePhoto() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ employee, file }: { employee: Pick<Employee, 'id' | 'photo_path'>; file: File }) => {
      const blob = await shrink(file)
      const path = `${employee.id}/photo-${Date.now()}.jpg`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, blob, { contentType: 'image/jpeg' })
      if (upErr) throw new Error(upErr.message)
      const { error } = await supabase.from('employees').update({ photo_path: path }).eq('id', employee.id)
      if (error) {
        await supabase.storage.from(BUCKET).remove([path])
        throw new Error(error.message)
      }
      if (employee.photo_path) await supabase.storage.from(BUCKET).remove([employee.photo_path])
      return path
    },
    onSuccess: (_p, v) => {
      void qc.invalidateQueries({ queryKey: ['employees'] })
      void qc.invalidateQueries({ queryKey: ['employee', v.employee.id] })
    },
  })
}

export function useReissueCard() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { id: string; validTill: string | null; reason: string }) => {
      const { error } = await supabase.rpc('reissue_employee_card', { p_employee_id: v.id, p_valid_till: v.validTill, p_reason: v.reason || null })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => {
      void qc.invalidateQueries({ queryKey: ['employees'] })
      void qc.invalidateQueries({ queryKey: ['employee', v.id] })
      void qc.invalidateQueries({ queryKey: ['employee-events', v.id] })
    },
  })
}

const DOC_MIME = /^(application\/pdf|image\/(png|jpeg|webp))$/

export function useUploadEmployeeDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { employeeId: string; docType: string; title: string; docNumber: string; expiry: string; file: File }) => {
      if (v.file.size > 10 * 1024 * 1024) throw new Error('That file is over 10 MB.')
      if (!DOC_MIME.test(v.file.type)) throw new Error('Upload a PDF or a photo (JPG, PNG, WebP).')
      const ext = v.file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'pdf'
      const path = `${v.employeeId}/${v.docType}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, v.file, { contentType: v.file.type })
      if (upErr) throw new Error(upErr.message)
      const { error } = await supabase.from('employee_documents').insert({
        employee_id: v.employeeId,
        doc_type: v.docType,
        title: v.title.trim() || DOC_TYPES[v.docType] || 'Document',
        doc_number: v.docNumber.trim() || null,
        expiry_date: v.expiry || null,
        storage_path: path,
        mime_type: v.file.type,
        size_bytes: v.file.size,
      })
      if (error) {
        await supabase.storage.from(BUCKET).remove([path])
        throw new Error(error.message)
      }
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['employee-docs'] }),
  })
}

export function useUpdateEmployeeDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: { id: string; verified?: boolean; expiry_date?: string | null }) => {
      const { error } = await supabase.from('employee_documents').update(values).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['employee-docs'] }),
  })
}

export function useDeleteEmployeeDoc() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (d: EmployeeDocument) => {
      const { error } = await supabase.from('employee_documents').delete().eq('id', d.id)
      if (error) throw new Error(error.message)
      await supabase.storage.from(BUCKET).remove([d.storage_path])
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['employee-docs'] }),
  })
}

export function useAddEmployeeEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (v: { employeeId: string; kind: EventKind; title: string; detail: string; date: string }) => {
      const { error } = await supabase.from('employee_events').insert({
        employee_id: v.employeeId, kind: v.kind, title: v.title.trim(), detail: v.detail.trim() || null, event_date: v.date,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, v) => void qc.invalidateQueries({ queryKey: ['employee-events', v.employeeId] }),
  })
}

export function useDeleteEmployeeEvent() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (e: EmployeeEvent) => {
      const { error } = await supabase.from('employee_events').delete().eq('id', e.id)
      if (error) throw new Error(error.message)
    },
    onSuccess: (_d, e) => void qc.invalidateQueries({ queryKey: ['employee-events', e.employee_id] }),
  })
}

export function useSaveAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<EmployeeAsset> & { employee_id: string }) => {
      const { error } = id
        ? await supabase.from('employee_assets').update(values).eq('id', id)
        : await supabase.from('employee_assets').insert(values)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['employee-assets'] }),
  })
}

export function useDeleteAsset() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('employee_assets').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['employee-assets'] }),
  })
}

export function useSaveLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ id, ...values }: Partial<EmployeeLeave> & { employee_id: string }) => {
      const { error } = id
        ? await supabase.from('employee_leaves').update(values).eq('id', id)
        : await supabase.from('employee_leaves').insert(values)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['employee-leaves'] }),
  })
}

export function useDeleteLeave() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('employee_leaves').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['employee-leaves'] }),
  })
}

/** Approved leave days per type in the calendar year of `year`. */
export function leaveUsed(leaves: EmployeeLeave[], year = new Date().getFullYear()) {
  const used: Record<string, number> = {}
  for (const l of leaves) {
    if (l.status !== 'approved' || !l.from_date.startsWith(String(year))) continue
    used[l.leave_type] = (used[l.leave_type] ?? 0) + l.days
  }
  return used
}

/** Calendar days between two 'YYYY-MM-DD' dates, both counted. */
export function spanDays(from: string, to: string) {
  if (!from || !to) return 0
  return Math.round((local(to).getTime() - local(from).getTime()) / 86_400_000) + 1
}

/* ---------------------------------------------------------- public check */

export interface CardCheck {
  state: 'valid' | 'expired' | 'suspended' | 'exited' | 'unknown'
  name?: string
  code?: string
  designation?: string | null
  department?: string | null
  location?: string | null
  photo_path?: string | null
  blood_group?: string | null
  joining_date?: string | null
  valid_till?: string | null
  exit_date?: string | null
  issue_no?: number
}

export function useVerifyEmployee(token: string | undefined) {
  return useQuery({
    queryKey: ['verify-employee', token],
    enabled: !!token,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('verify_employee', { p_token: token })
      if (error) throw new Error(error.message)
      const c = data as CardCheck
      return { ...c, joining_date: ymd(c.joining_date), valid_till: ymd(c.valid_till), exit_date: ymd(c.exit_date) }
    },
  })
}

/* --------------------------------------------------------------- export */

export function employeeCsvRows(list: Employee[], managers: Map<string, string>) {
  return list.map((e) => ({
    'Employee ID': e.employee_code,
    Name: e.full_name,
    Designation: e.designation ?? '',
    Department: e.department ?? '',
    Type: TYPE_LABEL[e.employment_type],
    Status: STATUS_LABEL[e.status],
    'Reports to': e.reporting_manager_id ? managers.get(e.reporting_manager_id) ?? '' : '',
    Location: e.work_location ?? '',
    Phone: e.phone ?? '',
    Email: e.email ?? '',
    Gender: e.gender ?? '',
    'Date of birth': e.dob ?? '',
    'Blood group': e.blood_group ?? '',
    'Joined on': e.joining_date,
    'Probation ends': e.probation_end ?? '',
    'Confirmed on': e.confirmation_date ?? '',
    'Monthly salary': e.monthly_salary ?? '',
    'Salary mode': e.salary_mode,
    Bank: e.bank_name ?? '',
    'Account no.': e.bank_account ?? '',
    IFSC: e.ifsc ?? '',
    PAN: e.pan ?? '',
    UAN: e.uan ?? '',
    'ESIC no.': e.esic_no ?? '',
    'Emergency contact': [e.emergency_name, e.emergency_relation, e.emergency_phone].filter(Boolean).join(' · '),
    City: e.city ?? '',
    'Exit date': e.exit_date ?? '',
    'Exit type': e.exit_type ? EXIT_LABEL[e.exit_type] : '',
    'ID card valid till': e.card_valid_till ?? '',
  }))
}

import { useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { addMonths, addYears, format } from 'date-fns'
import { ArrowLeft, Camera, Save } from 'lucide-react'
import {
  BLOOD_GROUPS, DEFAULT_DEPARTMENTS, TYPE_LABEL, useEmployee, useEmployees, useHrFileUrl, useSaveEmployee, useUploadEmployeePhoto,
  type Employee, type EmployeeInput,
} from '@/lib/employees'
import { Button, Card, CardBody, CardHeader, EmptyState, Field, Input, Select, Spinner, Textarea, useToast } from '@/components/ui'
import { initials } from '@/lib/format'

/**
 * Add or edit an employee: one page of sections rather than a modal, since
 * a full HR record is long and is often filled in on a phone at the desk.
 * Status changes and exits are made from the employee's page, where the
 * timeline records them.
 */
export function AdminEmployeeEditor() {
  const { id } = useParams()
  const { data: existing, isLoading } = useEmployee(id)
  // The manager list must be in before the form mounts, or its select
  // cannot pick up the saved manager.
  const { isLoading: listLoading } = useEmployees()
  if ((id && isLoading) || listLoading) return <Spinner />
  if (id && !existing) return <EmptyState title="Employee not found" action={<Link to="/admin/employees" className="text-sm font-semibold text-brand-700">Back to employees</Link>} />
  return <EditorForm key={existing?.id ?? 'new'} existing={existing ?? null} />
}

const ymd = (d: Date) => format(d, 'yyyy-MM-dd')

function EditorForm({ existing: e }: { existing: Employee | null }) {
  const navigate = useNavigate()
  const { data: all = [] } = useEmployees()
  const save = useSaveEmployee()
  const uploadPhoto = useUploadEmployeePhoto()
  const { push } = useToast()
  const { data: currentPhoto } = useHrFileUrl(e?.photo_path)
  const [photo, setPhoto] = useState<File | null>(null)
  const preview = useMemo(() => (photo ? URL.createObjectURL(photo) : null), [photo])
  const photoInput = useRef<HTMLInputElement>(null)
  const formRef = useRef<HTMLFormElement>(null)

  const [joining, setJoining] = useState(e?.joining_date ?? ymd(new Date()))
  const [probation, setProbation] = useState(e?.probation_end ?? '')
  const [validTill, setValidTill] = useState(e ? e.card_valid_till ?? '' : ymd(addYears(new Date(), 1)))
  const [type, setType] = useState(e?.employment_type ?? 'full_time')
  const [salaryMode, setSalaryMode] = useState(e?.salary_mode ?? 'bank')

  const departments = [...new Set([...all.map((x) => x.department).filter(Boolean) as string[], ...DEFAULT_DEPARTMENTS])].sort()
  const designations = [...new Set(all.map((x) => x.designation).filter(Boolean) as string[])].sort()
  const locations = [...new Set(all.map((x) => x.work_location).filter(Boolean) as string[])].sort()
  const managers = all.filter((x) => x.status !== 'exited' && x.id !== e?.id)

  function copyAddress() {
    const f = formRef.current
    if (!f) return
    ;(f.elements.namedItem('permanent_address') as HTMLTextAreaElement).value = (f.elements.namedItem('current_address') as HTMLTextAreaElement).value
  }

  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault()
    const f = new FormData(ev.currentTarget)
    const text = (k: string) => {
      const v = String(f.get(k) ?? '').trim()
      return v === '' ? null : v
    }
    const numOrNull = (k: string) => {
      const v = text(k)
      return v === null ? null : Number(v)
    }
    const values: EmployeeInput = {
      full_name: text('full_name') ?? '',
      gender: text('gender') as Employee['gender'],
      dob: text('dob'),
      blood_group: text('blood_group'),
      marital_status: text('marital_status'),
      father_name: text('father_name'),
      spouse_name: text('spouse_name'),
      qualification: text('qualification'),
      experience_years: numOrNull('experience_years'),
      previous_employer: text('previous_employer'),
      phone: text('phone'),
      alt_phone: text('alt_phone'),
      email: text('email'),
      personal_email: text('personal_email'),
      current_address: text('current_address'),
      permanent_address: text('permanent_address'),
      city: text('city'),
      state: text('state'),
      pincode: text('pincode'),
      department: text('department'),
      designation: text('designation'),
      employment_type: type,
      work_location: text('work_location'),
      shift: text('shift'),
      joining_date: joining,
      probation_end: probation || null,
      confirmation_date: text('confirmation_date'),
      contract_end: text('contract_end'),
      reporting_manager_id: text('reporting_manager_id'),
      monthly_salary: numOrNull('monthly_salary'),
      salary_mode: salaryMode,
      bank_name: text('bank_name'),
      bank_account: text('bank_account'),
      ifsc: text('ifsc'),
      account_holder: text('account_holder'),
      upi_id: text('upi_id'),
      pan: text('pan'),
      aadhaar_last4: text('aadhaar_last4'),
      uan: text('uan'),
      esic_no: text('esic_no'),
      emergency_name: text('emergency_name'),
      emergency_relation: text('emergency_relation'),
      emergency_phone: text('emergency_phone'),
      card_valid_till: validTill || null,
      notes: text('notes'),
    }
    try {
      const saved = await save.mutateAsync({ id: e?.id, values })
      if (photo) {
        try {
          await uploadPhoto.mutateAsync({ employee: saved, file: photo })
        } catch (err) {
          push('error', `Saved, but the photo did not upload: ${(err as Error).message}`)
        }
      }
      push('success', e ? 'Employee updated.' : `${saved.full_name} added as ${saved.employee_code}.`)
      navigate(`/admin/employees/${saved.id}`)
    } catch (err) {
      push('error', (err as Error).message)
    }
  }

  const photoUrl = preview ?? currentPhoto
  const busy = save.isPending || uploadPhoto.isPending

  return (
    <form ref={formRef} onSubmit={(ev) => void submit(ev)} className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <Link to={e ? `/admin/employees/${e.id}` : '/admin/employees'} className="mb-2 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-700">
          <ArrowLeft className="h-3.5 w-3.5" /> {e ? e.full_name : 'Employees'}
        </Link>
        <h1 className="text-xl font-bold tracking-tight text-brand-darker sm:text-2xl">{e ? `Edit ${e.full_name}` : 'Add employee'}</h1>
        <span className="mt-2 block h-1 w-12 rounded-full bg-gold-metal" aria-hidden />
        <p className="mt-2 text-sm text-slate-500">
          {e ? <>Employee ID <span className="font-mono font-semibold">{e.employee_code}</span>. </> : 'An employee ID (RSGC-E-0001…) is given on saving. '}
          Only the name and joining date are required; fill the rest as papers come in.
        </p>
      </div>
        <Button type="submit" loading={busy}><Save className="h-4 w-4" /> {e ? 'Save changes' : 'Add employee'}</Button>
      </div>

      <Section title="Personal" subtitle="As on their ID proof. The photo goes on the ID card.">
        <div className="flex flex-col gap-5 sm:flex-row">
          <div className="flex shrink-0 flex-col items-center gap-2">
            <div className="h-32 w-[104px] overflow-hidden rounded-xl bg-slate-100 ring-2 ring-brand-gold/40">
              {photoUrl
                ? <img src={photoUrl} alt="" className="h-full w-full object-cover" />
                : <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-slate-400">{initials(e?.full_name ?? '?')}</div>}
            </div>
            <input ref={photoInput} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(ev) => { const file = ev.target.files?.[0]; if (file) setPhoto(file) }} />
            <Button type="button" size="sm" variant="outline" onClick={() => photoInput.current?.click()}>
              <Camera className="h-4 w-4" /> {photoUrl ? 'Change photo' : 'Upload photo'}
            </Button>
            <p className="max-w-[140px] text-center text-[11px] text-slate-400">Front-facing, plain background</p>
          </div>
          <Grid>
            <Field label="Full name" required><Input name="full_name" required minLength={2} maxLength={120} defaultValue={e?.full_name ?? ''} /></Field>
            <Field label="Father's name"><Input name="father_name" defaultValue={e?.father_name ?? ''} /></Field>
            <Field label="Gender">
              <Select name="gender" defaultValue={e?.gender ?? ''}>
                <option value="">—</option><option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Date of birth"><Input type="date" name="dob" defaultValue={e?.dob ?? ''} max={ymd(addYears(new Date(), -14))} /></Field>
            <Field label="Blood group" hint="Printed on the ID card">
              <Select name="blood_group" defaultValue={e?.blood_group ?? ''}>
                <option value="">—</option>{BLOOD_GROUPS.map((b) => <option key={b}>{b}</option>)}
              </Select>
            </Field>
            <Field label="Marital status">
              <Select name="marital_status" defaultValue={e?.marital_status ?? ''}>
                <option value="">—</option><option value="single">Single</option><option value="married">Married</option>
                <option value="widowed">Widowed</option><option value="divorced">Divorced</option>
              </Select>
            </Field>
            <Field label="Spouse's name"><Input name="spouse_name" defaultValue={e?.spouse_name ?? ''} /></Field>
            <Field label="Highest qualification"><Input name="qualification" placeholder="e.g. B.Com, MBA" defaultValue={e?.qualification ?? ''} /></Field>
            <Field label="Experience before joining (years)"><Input type="number" name="experience_years" min={0} max={60} step={0.5} defaultValue={e?.experience_years ?? ''} /></Field>
            <Field label="Previous employer"><Input name="previous_employer" defaultValue={e?.previous_employer ?? ''} /></Field>
          </Grid>
        </div>
      </Section>

      <Section title="Contact">
        <Grid>
          <Field label="Mobile"><Input name="phone" type="tel" inputMode="numeric" pattern="[0-9+ \-]{10,15}" defaultValue={e?.phone ?? ''} /></Field>
          <Field label="Alternate mobile"><Input name="alt_phone" type="tel" inputMode="numeric" pattern="[0-9+ \-]{10,15}" defaultValue={e?.alt_phone ?? ''} /></Field>
          <Field label="Official email"><Input name="email" type="email" defaultValue={e?.email ?? ''} /></Field>
          <Field label="Personal email"><Input name="personal_email" type="email" defaultValue={e?.personal_email ?? ''} /></Field>
        </Grid>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Field label="Current address"><Textarea name="current_address" rows={2} defaultValue={e?.current_address ?? ''} /></Field>
          <div>
            <Field label="Permanent address"><Textarea name="permanent_address" rows={2} defaultValue={e?.permanent_address ?? ''} /></Field>
            <button type="button" onClick={copyAddress} className="mt-1 text-xs font-medium text-brand-700 hover:underline">Same as current address</button>
          </div>
        </div>
        <div className="mt-4"><Grid>
          <Field label="City"><Input name="city" defaultValue={e?.city ?? ''} /></Field>
          <Field label="State"><Input name="state" defaultValue={e?.state ?? ''} /></Field>
          <Field label="PIN code"><Input name="pincode" inputMode="numeric" pattern="[0-9]{6}" maxLength={6} defaultValue={e?.pincode ?? ''} /></Field>
        </Grid></div>
      </Section>

      <Section title="Job" subtitle="Changes to designation, department, location, manager or salary are written to the timeline by themselves.">
        <Grid>
          <Field label="Designation"><Input name="designation" list="emp-designations" placeholder="e.g. Sales Executive" defaultValue={e?.designation ?? ''} /></Field>
          <Field label="Department"><Input name="department" list="emp-departments" defaultValue={e?.department ?? ''} /></Field>
          <Field label="Employment type">
            <Select value={type} onChange={(ev) => setType(ev.target.value as Employee['employment_type'])}>
              {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Reports to">
            <Select name="reporting_manager_id" defaultValue={e?.reporting_manager_id ?? ''}>
              <option value="">No one</option>
              {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name}{m.designation ? ` — ${m.designation}` : ''}</option>)}
            </Select>
          </Field>
          <Field label="Work location / branch"><Input name="work_location" list="emp-locations" placeholder="e.g. Head Office, Gurgaon" defaultValue={e?.work_location ?? ''} /></Field>
          <Field label="Shift / timings"><Input name="shift" placeholder="e.g. 10:00 – 6:30, Mon–Sat" defaultValue={e?.shift ?? ''} /></Field>
          <Field label="Joining date" required><Input type="date" required value={joining} onChange={(ev) => setJoining(ev.target.value)} /></Field>
          <div>
            <Field label="Probation ends"><Input type="date" value={probation} min={joining} onChange={(ev) => setProbation(ev.target.value)} /></Field>
            <div className="mt-1 flex gap-2 text-xs">
              {[3, 6].map((m) => (
                <button key={m} type="button" className="font-medium text-brand-700 hover:underline"
                  onClick={() => setProbation(ymd(addMonths(new Date(`${joining}T00:00:00`), m)))}>{m} months</button>
              ))}
              {probation && <button type="button" className="text-slate-500 hover:underline" onClick={() => setProbation('')}>None</button>}
            </div>
          </div>
          <Field label="Confirmed on" hint="Leave blank while on probation"><Input type="date" name="confirmation_date" min={joining} defaultValue={e?.confirmation_date ?? ''} /></Field>
          {(type === 'contract' || type === 'intern' || type === 'consultant' || e?.contract_end) && (
            <Field label="Contract / internship ends"><Input type="date" name="contract_end" min={joining} defaultValue={e?.contract_end ?? ''} /></Field>
          )}
        </Grid>
        <datalist id="emp-departments">{departments.map((d) => <option key={d} value={d} />)}</datalist>
        <datalist id="emp-designations">{designations.map((d) => <option key={d} value={d} />)}</datalist>
        <datalist id="emp-locations">{locations.map((d) => <option key={d} value={d} />)}</datalist>
      </Section>

      <Section title="Salary & bank" subtitle="Seen only by the office.">
        <Grid>
          <Field label="Monthly salary (₹)"><Input type="number" name="monthly_salary" min={0} step={1} defaultValue={e?.monthly_salary ?? ''} /></Field>
          <Field label="Paid by">
            <Select value={salaryMode} onChange={(ev) => setSalaryMode(ev.target.value as Employee['salary_mode'])}>
              <option value="bank">Bank transfer</option><option value="upi">UPI</option><option value="cheque">Cheque</option><option value="cash">Cash</option>
            </Select>
          </Field>
          <Field label="Account holder name"><Input name="account_holder" defaultValue={e?.account_holder ?? ''} /></Field>
          <Field label="Bank name"><Input name="bank_name" defaultValue={e?.bank_name ?? ''} /></Field>
          <Field label="Account number"><Input name="bank_account" inputMode="numeric" pattern="[0-9]{6,20}" defaultValue={e?.bank_account ?? ''} /></Field>
          <Field label="IFSC"><Input name="ifsc" className="uppercase" pattern="[A-Za-z]{4}0[A-Za-z0-9]{6}" placeholder="HDFC0001234" defaultValue={e?.ifsc ?? ''} /></Field>
          <Field label="UPI ID"><Input name="upi_id" placeholder="name@bank" defaultValue={e?.upi_id ?? ''} /></Field>
        </Grid>
      </Section>

      <Section title="Statutory IDs" subtitle="Only the last 4 digits of Aadhaar are kept; upload the card itself under Documents if you need it.">
        <Grid>
          <Field label="PAN"><Input name="pan" className="uppercase" pattern="[A-Za-z]{5}[0-9]{4}[A-Za-z]" placeholder="ABCDE1234F" maxLength={10} defaultValue={e?.pan ?? ''} /></Field>
          <Field label="Aadhaar (last 4 digits)"><Input name="aadhaar_last4" inputMode="numeric" pattern="[0-9]{4}" maxLength={4} placeholder="XXXX" defaultValue={e?.aadhaar_last4 ?? ''} /></Field>
          <Field label="UAN (PF)"><Input name="uan" inputMode="numeric" defaultValue={e?.uan ?? ''} /></Field>
          <Field label="ESIC number"><Input name="esic_no" defaultValue={e?.esic_no ?? ''} /></Field>
        </Grid>
      </Section>

      <Section title="Emergency contact" subtitle="Printed on the back of the ID card.">
        <Grid>
          <Field label="Name"><Input name="emergency_name" defaultValue={e?.emergency_name ?? ''} /></Field>
          <Field label="Relation"><Input name="emergency_relation" list="emp-relations" placeholder="e.g. Father" defaultValue={e?.emergency_relation ?? ''} /></Field>
          <Field label="Phone"><Input name="emergency_phone" type="tel" pattern="[0-9+ \-]{10,15}" defaultValue={e?.emergency_phone ?? ''} /></Field>
        </Grid>
        <datalist id="emp-relations">{['Father', 'Mother', 'Spouse', 'Brother', 'Sister', 'Son', 'Daughter', 'Friend'].map((r) => <option key={r} value={r} />)}</datalist>
      </Section>

      <Section title="ID card & notes">
        <Grid>
          <Field label="ID card valid till" hint="Blank = valid while employed">
            <Input type="date" value={validTill} min={e ? undefined : ymd(new Date())} onChange={(ev) => setValidTill(ev.target.value)} />
          </Field>
        </Grid>
        <div className="mt-4"><Field label="Notes (office only)"><Textarea name="notes" rows={3} defaultValue={e?.notes ?? ''} /></Field></div>
      </Section>

      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={() => navigate(-1)}>Cancel</Button>
        <Button type="submit" loading={busy}><Save className="h-4 w-4" /> {e ? 'Save changes' : 'Add employee'}</Button>
      </div>
    </form>
  )
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <Card>
      <CardHeader title={title} subtitle={subtitle} />
      <CardBody>{children}</CardBody>
    </Card>
  )
}

function Grid({ children }: { children: ReactNode }) {
  return <div className="grid flex-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
}

import { useMemo, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import {
  MoreHorizontal, RefreshCw, UserPlus, Eye, KeyRound, Ban, Trash2, CheckCircle2, Search, Trophy,
} from 'lucide-react'
import {
  Badge, Button, Card, EmptyState, ErrorState, Field, Input, Modal, PageHeader, Select,
  Spinner, Table, Td, Th, useToast,
} from '@/components/ui'
import {
  useMembers, useRanks, useRecalculateNetwork, useRecalculateMember, useSetMemberStatus,
  useCreateMember, useSetMemberPassword, useDeleteMember, useRankReview,
} from '@/lib/queries'
import { ReferralQueue } from '@/pages/admin/ReferralQueue'
import { rankTone, statusTone } from '@/lib/network'
import type { Profile } from '@/lib/types'

export function AdminMembers() {
  const navigate = useNavigate()
  const { data: members = [], isLoading, error } = useMembers()
  const { data: ranks = [] } = useRanks()
  const recalcAll = useRecalculateNetwork()
  const recalcOne = useRecalculateMember()
  const setStatus = useSetMemberStatus()
  const del = useDeleteMember()
  const rankReview = useRankReview()
  const toast = useToast()

  const [search, setSearch] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const [pwFor, setPwFor] = useState<Profile | null>(null)
  const [viewFor, setViewFor] = useState<Profile | null>(null)
  const [delFor, setDelFor] = useState<Profile | null>(null)

  const codeName = useMemo(() => {
    const m = new Map<string, string>()
    members.forEach((p) => m.set(p.id, p.member_code ?? '—'))
    return m
  }, [members])

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter((p) =>
      [p.member_code, p.full_name, p.email, p.phone, p.referrer?.member_code, p.rank?.name]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q)),
    )
  }, [members, search])

  return (
    <div>
      <PageHeader
        title="Members"
        description="Manage every sponsor in the Royal Green Company network."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              loading={rankReview.isPending}
              onClick={() =>
                rankReview.mutate(undefined, {
                  onSuccess: (n) => toast.push('success', `${n} member${n === '1' ? '' : 's'} promoted`),
                  onError: (e) => toast.push('error', (e as Error).message),
                })
              }
            >
              <Trophy className="h-4 w-4" /> Run rank review
            </Button>
            <Button
              variant="outline"
              loading={recalcAll.isPending}
              onClick={() =>
                recalcAll.mutate(undefined, {
                  onSuccess: () => toast.push('success', 'Network recalculated'),
                  onError: (e) => toast.push('error', (e as Error).message),
                })
              }
            >
              <RefreshCw className="h-4 w-4" /> Reset &amp; Recalculate All
            </Button>
            <Button onClick={() => setAddOpen(true)}>
              <UserPlus className="h-4 w-4" /> Add Member
            </Button>
          </div>
        }
      />

      {/* Members the network referred themselves, waiting on the office. */}
      <ReferralQueue />

      <Card className="overflow-visible">
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-200 px-4 py-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search members…"
              className="pl-9"
            />
          </div>
          <span className="text-xs text-slate-500">{filtered.length} of {members.length}</span>
        </div>

        {isLoading ? (
          <Spinner label="Loading members…" />
        ) : error ? (
          <div className="p-5"><ErrorState error={error} /></div>
        ) : filtered.length === 0 ? (
          <EmptyState title="No members found" description="Try a different search, or add your first member." />
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>Sponsor ID</Th>
                <Th>Name</Th>
                <Th>Placement ID</Th>
                <Th>Referral ID</Th>
                <Th>Email</Th>
                <Th>Phone</Th>
                <Th>Rank</Th>
                <Th>Joined</Th>
                <Th>Status</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={m.id} className="hover:bg-slate-50">
                  <Td className="font-semibold">
                    <Link to={`/admin/members/${m.member_code}`} className="text-brand-700 hover:underline">{m.member_code}</Link>
                  </Td>
                  <Td className="whitespace-nowrap font-medium text-slate-800">
                    <Link to={`/admin/members/${m.member_code}`} className="hover:text-brand-700">{m.full_name || '—'}</Link>
                  </Td>
                  <Td className="text-slate-500">{m.placement_parent?.member_code ?? (m.placement_parent_id ? codeName.get(m.placement_parent_id) : '—')}</Td>
                  <Td className="text-slate-500">{m.referrer?.member_code ?? (m.referrer_id ? codeName.get(m.referrer_id) : '—')}</Td>
                  <Td className="text-slate-500">{m.email ?? '—'}</Td>
                  <Td className="text-slate-500">{m.phone ?? '—'}</Td>
                  <Td><Badge tone={rankTone(m.rank?.name)}>{m.rank?.name ?? '—'}</Badge></Td>
                  <Td className="whitespace-nowrap text-slate-500">
                    {new Date(m.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </Td>
                  <Td><Badge tone={statusTone(m.status)}>{m.status}</Badge></Td>
                  <Td className="text-right">
                    <RowMenu
                      open={menuFor === m.id}
                      onToggle={() => setMenuFor(menuFor === m.id ? null : m.id)}
                      onClose={() => setMenuFor(null)}
                      items={[
                        { label: 'Open dashboard', icon: <Eye className="h-4 w-4" />, onClick: () => navigate(`/admin/members/${m.member_code}`) },
                        { label: 'Quick view', icon: <Eye className="h-4 w-4" />, onClick: () => setViewFor(m) },
                        {
                          label: 'Recalculate', icon: <RefreshCw className="h-4 w-4" />,
                          onClick: () => recalcOne.mutate(m.id, {
                            onSuccess: () => toast.push('success', `${m.member_code} recalculated`),
                            onError: (e) => toast.push('error', (e as Error).message),
                          }),
                        },
                        { label: 'Change password', icon: <KeyRound className="h-4 w-4" />, onClick: () => setPwFor(m) },
                        // A sign-up arrives pending and cannot reach the sponsor
                        // panel until the office approves it, so that is the
                        // action offered first for a pending account.
                        m.status === 'pending'
                          ? {
                              label: 'Approve sign-up', icon: <CheckCircle2 className="h-4 w-4" />,
                              onClick: () => setStatus.mutate({ id: m.id, status: 'active' }, {
                                onSuccess: () => toast.push('success', `${m.full_name} approved — they can sign in now`),
                                onError: (e) => toast.push('error', (e as Error).message),
                              }),
                            }
                          : m.status === 'suspended'
                          ? {
                              label: 'Activate', icon: <CheckCircle2 className="h-4 w-4" />,
                              onClick: () => setStatus.mutate({ id: m.id, status: 'active' }, {
                                onSuccess: () => toast.push('success', `${m.full_name} activated`),
                                onError: (e) => toast.push('error', (e as Error).message),
                              }),
                            }
                          : {
                              label: 'Suspend', icon: <Ban className="h-4 w-4" />,
                              onClick: () => setStatus.mutate({ id: m.id, status: 'suspended' }, {
                                onSuccess: () => toast.push('success', `${m.full_name} suspended`),
                                onError: (e) => toast.push('error', (e as Error).message),
                              }),
                            },
                        { label: 'Delete', icon: <Trash2 className="h-4 w-4" />, danger: true, onClick: () => setDelFor(m) },
                      ]}
                    />
                  </Td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {addOpen && <AddMemberModal members={members} ranks={ranks} onClose={() => setAddOpen(false)} />}
      {pwFor && <ChangePasswordModal member={pwFor} onClose={() => setPwFor(null)} />}
      {viewFor && <ViewProfileModal member={viewFor} onClose={() => setViewFor(null)} />}
      {delFor && (
        <Modal
          open
          onClose={() => setDelFor(null)}
          title="Delete member"
          footer={
            <>
              <Button variant="outline" onClick={() => setDelFor(null)}>Cancel</Button>
              <Button
                variant="danger"
                loading={del.isPending}
                onClick={() =>
                  del.mutate(delFor.id, {
                    onSuccess: () => { toast.push('success', 'Member removed'); setDelFor(null) },
                    onError: (e) => toast.push('error', (e as Error).message),
                  })
                }
              >
                Delete
              </Button>
            </>
          }
        >
          <p className="text-sm text-slate-600">
            Remove <span className="font-semibold">{delFor.full_name}</span> ({delFor.member_code}) from the network?
            Their downline stays intact but they will no longer appear in the member list.
          </p>
        </Modal>
      )}
    </div>
  )
}

/* ------------------------------------------------------------- row menu */

function RowMenu({
  open, onToggle, onClose, items,
}: {
  open: boolean
  onToggle: () => void
  onClose: () => void
  items: { label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean }[]
}) {
  return (
    <div className="relative inline-block text-left">
      <button
        onClick={onToggle}
        className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={onClose} aria-hidden />
          <div className="absolute right-0 z-20 mt-1 w-44 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
            {items.map((it) => (
              <button
                key={it.label}
                onClick={() => { it.onClick(); onClose() }}
                className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm ${
                  it.danger ? 'text-red-600 hover:bg-red-50' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

/* --------------------------------------------------------- add member */

function AddMemberModal({
  members, ranks, onClose,
}: {
  members: Profile[]
  ranks: { id: string; name: string; seniority: number }[]
  onClose: () => void
}) {
  const create = useCreateMember()
  const toast = useToast()
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError(null)
    const f = new FormData(e.currentTarget)
    create.mutate(
      {
        full_name: String(f.get('full_name') ?? ''),
        email: String(f.get('email') ?? ''),
        password: String(f.get('password') ?? ''),
        phone: String(f.get('phone') ?? '') || undefined,
        referrer_id: (f.get('referrer_id') as string) || null,
        rank_id: (f.get('rank_id') as string) || null,
        city: String(f.get('city') ?? '') || undefined,
        state: String(f.get('state') ?? '') || undefined,
      },
      {
        onSuccess: (d) => { toast.push('success', `Member ${d.member_code ?? ''} created`); onClose() },
        onError: (err) => setError((err as Error).message),
      },
    )
  }

  return (
    <Modal
      open
      onClose={onClose}
      title="Add member"
      size="lg"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button loading={create.isPending} onClick={() => formRef.current?.requestSubmit()}>Create member</Button>
        </>
      }
    >
      <form ref={formRef} onSubmit={onSubmit} className="space-y-4">
        {error && <ErrorState error={error} />}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Full name" required><Input name="full_name" required placeholder="Member name" /></Field>
          <Field label="Phone"><Input name="phone" placeholder="10-digit mobile" inputMode="tel" /></Field>
          <Field label="Email" required><Input name="email" type="email" required placeholder="member@example.com" /></Field>
          <Field label="Temporary password" required><Input name="password" type="text" required minLength={6} placeholder="Min 6 characters" /></Field>
          <Field label="Sponsor (referrer)">
            <Select name="referrer_id" defaultValue="">
              <option value="">— None (root) —</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.member_code} · {m.full_name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Rank">
            <Select name="rank_id" defaultValue={ranks[0]?.id ?? ''}>
              {ranks.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </Select>
          </Field>
          <Field label="City"><Input name="city" placeholder="City" /></Field>
          <Field label="State"><Input name="state" placeholder="State" /></Field>
        </div>
        <p className="text-xs text-slate-500">
          The member is placed directly under the chosen sponsor in both the sponsor and placement trees.
        </p>
      </form>
    </Modal>
  )
}

/* ----------------------------------------------------- change password */

function ChangePasswordModal({ member, onClose }: { member: Profile; onClose: () => void }) {
  const setPw = useSetMemberPassword()
  const toast = useToast()
  const [pw, setPw2] = useState('')
  const [error, setError] = useState<string | null>(null)

  return (
    <Modal
      open
      onClose={onClose}
      title={`Change password — ${member.full_name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            loading={setPw.isPending}
            onClick={() => {
              setError(null)
              setPw.mutate(
                { memberId: member.id, password: pw },
                {
                  onSuccess: () => { toast.push('success', 'Password updated'); onClose() },
                  onError: (e) => setError((e as Error).message),
                },
              )
            }}
          >
            Update password
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {error && <ErrorState error={error} />}
        <Field label={`New password for ${member.member_code}`} required hint="Minimum 6 characters.">
          <Input type="text" value={pw} onChange={(e) => setPw2(e.target.value)} placeholder="New password" />
        </Field>
      </div>
    </Modal>
  )
}

/* -------------------------------------------------------- view profile */

function ViewProfileModal({ member, onClose }: { member: Profile; onClose: () => void }) {
  const rows: [string, React.ReactNode][] = [
    ['Sponsor ID', member.member_code],
    ['Name', member.full_name],
    ['Rank', <Badge tone={rankTone(member.rank?.name)}>{member.rank?.name ?? '—'}</Badge>],
    ['Status', <Badge tone={statusTone(member.status)}>{member.status}</Badge>],
    ['Referral ID', member.referrer?.member_code ?? '—'],
    ['Placement ID', member.placement_parent?.member_code ?? '—'],
    ['Direct team', member.direct_count],
    ['Total downline', member.team_count],
    ['Email', member.email ?? '—'],
    ['Phone', member.phone ?? '—'],
    ['Location', [member.city, member.state].filter(Boolean).join(', ') || '—'],
    ['Joined', new Date(member.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })],
  ]
  return (
    <Modal open onClose={onClose} title={`${member.full_name} · ${member.member_code}`}>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
        {rows.map(([k, v]) => (
          <div key={k}>
            <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">{k}</dt>
            <dd className="mt-0.5 text-sm text-slate-800">{v}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  )
}

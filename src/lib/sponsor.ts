import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '@/lib/supabase'
import type { Profile, Rank } from '@/lib/types'

/**
 * The Sponsor Panel's data layer.
 *
 * Two rules hold everywhere in here:
 *   1. Own data only. Reads are scoped to the signed-in member and the writes
 *      go through SECURITY DEFINER RPCs that re-check every rule server-side —
 *      nothing here is the authority, it only asks.
 *   2. One balance formula. Wallet figures come from my_wallet(); no screen
 *      adds up rows of its own to produce a balance.
 */

/* ------------------------------------------------------------------ types */

export type IncomeSource =
  | 'direct_income' | 'level_income' | 'sponsor_income' | 'salary' | 'reward' | 'adjustment'

export interface LedgerRow {
  id: string
  member_id: string
  kind: 'credit' | 'debit'
  source: string | null
  reference: string | null
  amount: number
  gross: number
  tds: number
  admin_charge: number
  net: number
  status: 'credited' | 'reversed'
  level: number | null
  from_member_id: string | null
  booking_id: string | null
  area_sqyd: number | null
  rate_applied: number | null
  in_kind: boolean
  note: string | null
  created_at: string
}

export interface WithdrawalRow {
  id: string
  member_id: string
  amount: number
  account: string | null
  utr: string | null
  status: 'requested' | 'approved' | 'paid' | 'rejected' | 'cancelled'
  requested_at: string
  processed_at: string | null
  approved_at: string | null
  paid_at: string | null
  payout_reference: string | null
  reject_reason: string | null
  note: string | null
}

export interface DownlineRow {
  id: string
  member_code: string | null
  full_name: string
  rank_name: string | null
  rank_seniority: number | null
  status: string
  level: number
  direct_count: number
  team_count: number
  joined: string
  sponsor_id: string | null
  sponsor_code: string | null
  sponsor_name: string | null
}

export interface WalletBalance {
  credited: number
  withdrawn: number
  pending: number
  available: number
}

export interface SponsorRates {
  tds_pct: number
  admin_pct: number
  min_withdrawal: number
}

export interface ReferralRow {
  id: string
  full_name: string
  mobile: string
  email: string | null
  city: string | null
  status: 'invited' | 'registered' | 'active' | 'rejected'
  reject_reason: string | null
  created_at: string
  joined_at: string | null
}

/** A confirmed sale as the member's own record of it. */
export interface SaleRow {
  id: string
  reference: string
  status: string
  sale_value: number
  token_amount?: number
  /** The buyer as the member named them; usually a walk-in with no account. */
  customer_name?: string | null
  customer_phone?: string | null
  created_at: string
  step3_at: string | null
  reject_remark?: string | null
  plot?: { id: string; number: string; size: number | null; size_unit: string } | null
  project?: { id: string; name: string } | null
}

function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }): T {
  if (error) throw new Error(error.message)
  return (data ?? []) as T
}

/* ------------------------------------------------------------------ reads */

export function useMyWallet(memberId: string | undefined) {
  return useQuery({
    queryKey: ['sponsor-wallet', memberId],
    enabled: Boolean(memberId),
    queryFn: async (): Promise<WalletBalance> => {
      const { data, error } = await supabase.rpc('my_wallet')
      if (error) throw new Error(error.message)
      const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null
      return {
        credited: Number(row?.credited ?? 0),
        withdrawn: Number(row?.withdrawn ?? 0),
        pending: Number(row?.pending ?? 0),
        available: Number(row?.available ?? 0),
      }
    },
  })
}

export function useMyLedger(memberId: string | undefined) {
  return useQuery({
    queryKey: ['sponsor-ledger', memberId],
    enabled: Boolean(memberId),
    queryFn: async () =>
      unwrap<LedgerRow[]>(
        await supabase
          .from('member_ledger')
          .select('*')
          .eq('member_id', memberId!)
          .order('created_at', { ascending: false }),
      ),
  })
}

export interface StatementRow {
  id: string
  kind: 'credit' | 'debit'
  source: string
  reference: string | null
  note: string | null
  gross: number
  tds: number
  admin_charge: number
  net: number
  status: 'credited' | 'reversed'
  level: number | null
  from_member_id: string | null
  from_member_name: string | null
  booking_id: string | null
  area_sqyd: number | null
  rate_applied: number | null
  in_kind: boolean
  created_at: string
  balance_after: number
  total_count: number
}

/**
 * One page of the wallet statement, with the running balance computed
 * server-side over the member's whole ledger — so page 2 shows the same
 * "balance after" it would on one long page, and a 10,000-row ledger never
 * reaches the browser.
 */
export function useMyStatement(
  memberId: string | undefined,
  opts: { limit?: number; offset?: number; source?: string | null } = {},
) {
  const { limit = 25, offset = 0, source = null } = opts
  return useQuery({
    queryKey: ['sponsor-statement', memberId, limit, offset, source],
    enabled: Boolean(memberId),
    placeholderData: (prev) => prev,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_ledger_page', {
        p_limit: limit,
        p_offset: offset,
        p_source: source,
        p_from: null,
        p_to: null,
      })
      if (error) throw new Error(error.message)
      return ((data ?? []) as StatementRow[]).map((r) => ({
        ...r,
        gross: Number(r.gross),
        tds: Number(r.tds),
        admin_charge: Number(r.admin_charge),
        net: Number(r.net),
        balance_after: Number(r.balance_after),
        total_count: Number(r.total_count),
      }))
    },
  })
}

export function useMyWithdrawals(memberId: string | undefined) {
  return useQuery({
    queryKey: ['sponsor-withdrawals', memberId],
    enabled: Boolean(memberId),
    queryFn: async () =>
      unwrap<WithdrawalRow[]>(
        await supabase
          .from('withdrawals')
          .select('*')
          .eq('member_id', memberId!)
          .order('requested_at', { ascending: false }),
      ),
  })
}

/** The caller's own subtree, levels 1–12. Never anyone else's. */
export function useMyDownline(memberId: string | undefined) {
  return useQuery({
    queryKey: ['sponsor-downline', memberId],
    enabled: Boolean(memberId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_downline')
      if (error) throw new Error(error.message)
      return ((data ?? []) as DownlineRow[]).map((d) => ({
        ...d,
        level: Number(d.level),
        direct_count: Number(d.direct_count ?? 0),
        team_count: Number(d.team_count ?? 0),
      }))
    },
  })
}

export function useMySales(memberId: string | undefined) {
  return useQuery({
    queryKey: ['sponsor-sales', memberId],
    enabled: Boolean(memberId),
    queryFn: async () => {
      // The embed types come back as arrays from the client's generic; the
      // gateway returns a single related row, as every other query here does.
      const { data, error } = await supabase
        .from('bookings')
        .select('id, reference, status, sale_value, token_amount, customer_name, customer_phone, reject_remark, created_at, step3_at, plot:plots ( id, number, size, size_unit ), project:projects ( id, name )')
        .eq('rep_id', memberId!)
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return (data ?? []) as unknown as SaleRow[]
    },
  })
}

export function useMyReferrals(memberId: string | undefined) {
  return useQuery({
    queryKey: ['sponsor-referrals', memberId],
    enabled: Boolean(memberId),
    queryFn: async () =>
      unwrap<ReferralRow[]>(
        await supabase
          .from('referral_requests')
          .select('*')
          .eq('sponsor_id', memberId!)
          .order('created_at', { ascending: false }),
      ),
  })
}

/**
 * The member's own sponsor — name and ID only.
 *
 * Not an embed on the profile: profiles' RLS (correctly) stops a member reading
 * their upline's row, so `referrer:profiles(...)` comes back null. This RPC
 * returns the one fact the business rules allow, and nothing about their business.
 */
export function useMySponsor(memberId: string | undefined) {
  return useQuery({
    queryKey: ['sponsor-upline', memberId],
    enabled: Boolean(memberId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('my_sponsor')
      if (error) throw new Error(error.message)
      const row = (Array.isArray(data) ? data[0] : data) as
        | { member_code: string | null; full_name: string | null }
        | null
      return row ?? null
    },
  })
}

/** TDS / admin / minimum-withdrawal, so the member can check the arithmetic. */
export function useSponsorRates() {
  return useQuery({
    queryKey: ['sponsor-rates'],
    queryFn: async (): Promise<SponsorRates> => {
      const { data, error } = await supabase
        .from('site_settings').select('value').eq('key', 'sponsor.rates').maybeSingle()
      if (error) throw new Error(error.message)
      const v = (data?.value ?? {}) as Record<string, string>
      return {
        tds_pct: Number(v.tds_pct ?? 5),
        admin_pct: Number(v.admin_pct ?? 3),
        min_withdrawal: Number(v.min_withdrawal ?? 500),
      }
    },
  })
}

export function useRankLadder() {
  return useQuery({
    queryKey: ['rank-ladder'],
    queryFn: async () => unwrap<Rank[]>(await supabase.from('ranks').select('*').order('seniority')),
  })
}

/* ----------------------------------------------------------------- writes */

export function useRequestWithdrawal(memberId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { amount: number; account?: string; note?: string; key: string }) => {
      const { data, error } = await supabase.rpc('request_withdrawal', {
        p_amount: input.amount,
        p_account: input.account ?? null,
        p_note: input.note ?? null,
        p_idempotency_key: input.key,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sponsor-withdrawals', memberId] })
      void qc.invalidateQueries({ queryKey: ['sponsor-wallet', memberId] })
    },
  })
}

export function useCancelWithdrawal(memberId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc('cancel_withdrawal', { p_id: id })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['sponsor-withdrawals', memberId] })
      void qc.invalidateQueries({ queryKey: ['sponsor-wallet', memberId] })
    },
  })
}

export function useSaveBankDetails() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      holder: string; bank: string; account: string; ifsc: string; type: string; upi: string; pan: string
    }) => {
      const { error } = await supabase.rpc('save_bank_details', {
        p_holder: input.holder, p_bank: input.bank, p_account: input.account,
        p_ifsc: input.ifsc, p_type: input.type, p_upi: input.upi, p_pan: input.pan,
      })
      if (error) throw new Error(error.message)
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sponsor-profile'] }),
  })
}

export function useSubmitReferral(memberId: string | undefined) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (input: { full_name: string; mobile: string; email?: string; city?: string; state?: string }) => {
      const { data, error } = await supabase.rpc('submit_referral', {
        p_full_name: input.full_name, p_mobile: input.mobile,
        p_email: input.email ?? null, p_city: input.city ?? null, p_state: input.state ?? null,
      })
      if (error) throw new Error(error.message)
      return data as string
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['sponsor-referrals', memberId] }),
  })
}

/** The member's own profile, including the payout fields the panel edits. */
export function useSponsorProfile(memberId: string | undefined) {
  return useQuery({
    queryKey: ['sponsor-profile', memberId],
    enabled: Boolean(memberId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`*, rank:ranks!profiles_rank_id_fkey ( id, name, seniority, own_sale_rate, active, description, salary, override_pct,
                 joining_fee, req_direct, req_team, req_legs, req_rank_sen, req_rank_count, reward_title, reward_sqyd ),
                 plan_rank:ranks!profiles_plan_rank_id_fkey ( id, name, seniority, own_sale_rate, salary, joining_fee, training_fee ),
                 referrer:profiles!profiles_referrer_id_fkey ( id, full_name, member_code )`)
        .eq('id', memberId!)
        .maybeSingle()
      if (error) throw new Error(error.message)
      return data as unknown as Profile | null
    },
  })
}

/* ------------------------------------------------------------ derivations */

export const INCOME_LABELS: Record<string, string> = {
  direct_income: 'Direct',
  level_income: 'Level',
  sponsor_income: 'Sponsor',
  salary: 'Salary',
  reward: 'Reward',
  adjustment: 'Adjustment',
}

/** Only rows that actually moved money count toward any total. */
export function isCounted(row: LedgerRow) {
  return row.status === 'credited' && !row.in_kind
}

export function netOf(rows: LedgerRow[]) {
  return rows.filter(isCounted).reduce((t, r) => t + (r.kind === 'debit' ? -Number(r.net) : Number(r.net)), 0)
}

/**
 * The balance formula, in TypeScript, for screens that already hold both lists
 * (the admin member view). It is the same arithmetic as app.member_balance() in
 * SQL — if these two ever disagree that is a defect, not a rounding tolerance.
 */
export function walletFrom(ledger: LedgerRow[], withdrawals: WithdrawalRow[]): WalletBalance {
  const credited = netOf(ledger)
  const withdrawn = withdrawals
    .filter((w) => w.status === 'paid')
    .reduce((t, w) => t + Number(w.amount), 0)
  const pending = withdrawals
    .filter((w) => w.status === 'requested' || w.status === 'approved')
    .reduce((t, w) => t + Number(w.amount), 0)
  return { credited, withdrawn, pending, available: credited - withdrawn - pending }
}

export function inMonth(iso: string, ref = new Date()) {
  const d = new Date(iso)
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth()
}

/** Indian financial year: 1 Apr – 31 Mar. */
export function inFinancialYear(iso: string, ref = new Date()) {
  const d = new Date(iso)
  const startYear = ref.getMonth() >= 3 ? ref.getFullYear() : ref.getFullYear() - 1
  const start = new Date(startYear, 3, 1)
  const end = new Date(startYear + 1, 2, 31, 23, 59, 59)
  return d >= start && d <= end
}

export interface LevelSummary {
  level: number
  members: number
  active: number
  income: number
}

/** Levels 1–12, always all twelve, so a member can see how deep they reach. */
export function levelSummary(downline: DownlineRow[], ledger: LedgerRow[]): LevelSummary[] {
  return Array.from({ length: 12 }, (_, i) => {
    const level = i + 1
    const at = downline.filter((d) => d.level === level)
    const income = netOf(ledger.filter((l) => l.source === 'level_income' && l.level === level))
    return {
      level,
      members: at.length,
      active: at.filter((d) => d.status === 'active').length,
      income,
    }
  })
}

export interface Requirement {
  label: string
  achieved: number
  required: number
  met: boolean
}

export interface RankProgress {
  current: Rank | null
  next: Rank | null
  requirements: Requirement[]
  percent: number
  allMet: boolean
  biggestGap: Requirement | null
}

/**
 * Progress toward the next rank. The bar is the LOWEST requirement percentage,
 * so it never promises more than the member has actually done.
 */
export function rankProgress(
  profile: Profile | null | undefined,
  ladder: Rank[],
  downline: DownlineRow[],
): RankProgress {
  const current = profile?.rank ?? null
  const currentSen = current?.seniority ?? 0
  const next = ladder.find((r) => r.seniority === currentSen + 1) ?? null
  if (!next) {
    return { current, next: null, requirements: [], percent: 100, allMet: true, biggestGap: null }
  }

  const directs = downline.filter((d) => d.level === 1)
  const requirements: Requirement[] = []

  const push = (label: string, achieved: number, required: number) => {
    if (required > 0) requirements.push({ label, achieved, required, met: achieved >= required })
  }

  push('Direct members', directs.length, next.req_direct ?? 0)
  push('Team size', downline.length, next.req_team ?? 0)

  // "N members at rank X anywhere in the team"
  if ((next.req_rank_count ?? 0) > 0 && next.req_rank_sen) {
    const needRank = ladder.find((r) => r.seniority === next.req_rank_sen)
    const qualified = downline.filter((d) => (d.rank_seniority ?? 0) >= (next.req_rank_sen ?? 0)).length
    push(`${needRank?.name ?? 'Qualified'} members in team`, qualified, next.req_rank_count ?? 0)
  }

  // Legs = distinct direct members whose branch contains a qualified leader.
  if ((next.req_legs ?? 0) > 0) {
    const qualifiedLegs = directs.filter((d) => {
      if ((d.rank_seniority ?? 0) >= (next.req_rank_sen ?? 0)) return true
      return branchOf(downline, d.id).some((m) => (m.rank_seniority ?? 0) >= (next.req_rank_sen ?? 0))
    }).length
    push('Qualified legs', qualifiedLegs, next.req_legs ?? 0)
  }

  const percent = requirements.length
    ? Math.min(100, Math.round(Math.min(...requirements.map((r) => (r.required ? (r.achieved / r.required) * 100 : 100)))))
    : 0
  const allMet = requirements.length > 0 && requirements.every((r) => r.met)
  const unmet = requirements.filter((r) => !r.met)
  const biggestGap = unmet.length
    ? unmet.reduce((best, r) => (r.achieved / r.required > best.achieved / best.required ? r : best))
    : null

  return { current, next, requirements, percent, allMet, biggestGap }
}

/** Everyone beneath a given direct member, within the caller's own subtree. */
export function branchOf(downline: DownlineRow[], rootId: string): DownlineRow[] {
  const out: DownlineRow[] = []
  let frontier = [rootId]
  while (frontier.length) {
    const next = downline.filter((d) => d.sponsor_id && frontier.includes(d.sponsor_id))
    out.push(...next)
    frontier = next.map((d) => d.id)
  }
  return out
}

/** Each of the member's direct members, with their whole branch counted. */
export function legsOf(downline: DownlineRow[]) {
  return downline
    .filter((d) => d.level === 1)
    .map((d) => ({ head: d, branch: branchOf(downline, d.id) }))
}

export interface RewardTier {
  seniority: number
  /** The rank this tier hangs off; award_reward() needs it to issue the goods. */
  rankId: string
  title: string
  targetSqyd: number
  earned: boolean
  progress: number
}

/** Reward ladder from the rank plan, measured in cumulative confirmed area. */
export function rewardTiers(ladder: Rank[], areaSold: number): RewardTier[] {
  return ladder
    .filter((r) => (r.reward_sqyd ?? 0) > 0 && r.reward_title)
    .map((r) => ({
      seniority: r.seniority,
      rankId: r.id,
      title: r.reward_title as string,
      targetSqyd: Number(r.reward_sqyd),
      earned: areaSold >= Number(r.reward_sqyd),
      progress: Math.min(100, Math.round((areaSold / Number(r.reward_sqyd)) * 100)),
    }))
    .sort((a, b) => a.targetSqyd - b.targetSqyd)
}

/**
 * Build the same downline shape the member's own my_downline() RPC returns,
 * but from the admin's flat member list — so the admin console and the member
 * panel compute rank progress and level counts from identical inputs.
 */
export function downlineFromMembers(members: Profile[], memberId: string): DownlineRow[] {
  const byReferrer = new Map<string, Profile[]>()
  for (const m of members) {
    if (!m.referrer_id) continue
    const list = byReferrer.get(m.referrer_id) ?? []
    list.push(m)
    byReferrer.set(m.referrer_id, list)
  }

  const out: DownlineRow[] = []
  let frontier = [memberId]
  for (let level = 1; level <= 12 && frontier.length; level += 1) {
    const next: string[] = []
    for (const parentId of frontier) {
      for (const child of byReferrer.get(parentId) ?? []) {
        const sponsor = members.find((p) => p.id === child.referrer_id)
        out.push({
          id: child.id,
          member_code: child.member_code,
          full_name: child.full_name,
          rank_name: child.rank?.name ?? null,
          rank_seniority: child.rank?.seniority ?? null,
          status: child.status,
          level,
          direct_count: child.direct_count ?? 0,
          team_count: child.team_count ?? 0,
          joined: child.created_at,
          sponsor_id: child.referrer_id,
          sponsor_code: sponsor?.member_code ?? null,
          sponsor_name: sponsor?.full_name ?? null,
        })
        next.push(child.id)
      }
    }
    frontier = next
  }
  return out
}

/** Area only counts once the company has confirmed the sale. */
export function confirmedArea(sales: SaleRow[]) {
  return sales
    .filter((s) => s.status === 'confirmed')
    .reduce((t, s) => t + Number(s.plot?.size ?? 0), 0)
}

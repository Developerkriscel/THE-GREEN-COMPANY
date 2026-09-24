// Domain types mirroring the Postgres schema.
// Regenerate the exhaustive version with `npm run gen:types` once the
// Supabase project is linked; these hand-written types keep the app typed today.

export type AppRole = 'admin' | 'manager' | 'rep' | 'customer'
export type AccountStatus = 'pending' | 'active' | 'suspended'
export type PlotStatus = 'available' | 'token' | 'booked' | 'registered' | 'sold' | 'blocked'
export type LeadStatus = 'new' | 'contacted' | 'visit_scheduled' | 'negotiation' | 'converted' | 'lost'
export type ApprovalStatus = 'draft' | 'step1_done' | 'step2_approved' | 'confirmed' | 'rejected' | 'cancelled'
export type EmiStatus = 'pending' | 'awaiting_verification' | 'paid' | 'overdue' | 'rejected'
export type CommissionStatus = 'accrued' | 'approved' | 'paid' | 'cancelled'
export type KycStatus = 'pending' | 'verified' | 'rejected'
export type DocType = 'welcome_letter' | 'booking_form' | 'receipt' | 'registry' | 'brochure' | 'agreement' | 'other'
export type ThreadStatus = 'open' | 'resolved'
export type ThreadKind = 'enquiry' | 'support' | 'internal'

export interface Rank {
  id: string
  name: string
  seniority: number
  /** Direct-sale commission, as a percentage of sale value. */
  own_sale_rate: number
  description: string | null
  active: boolean
  /* Business-plan economics — seeded by seniority, editable by an admin. */
  override_pct?: number
  salary?: number
  joining_fee?: number
  /** One-off training fee at joining; waived from AGM up (plan deck slide 9). */
  training_fee?: number
  req_direct?: number
  req_team?: number
  req_legs?: number
  req_rank_sen?: number | null
  req_rank_count?: number
  reward_title?: string | null
  reward_sqyd?: number
}

export interface Profile {
  id: string
  role: AppRole
  status: AccountStatus
  full_name: string
  email: string | null
  phone: string | null
  avatar_path: string | null
  user_code: string | null
  member_code: string | null
  rank_id: string | null
  /** The rank slab bought at joining -- the member's PLAN, chosen once. */
  plan_rank_id: string | null
  plan_chosen_at: string | null
  manager_id: string | null
  referrer_id: string | null
  placement_parent_id: string | null
  placement_position: string | null
  direct_count: number
  team_count: number
  frozen?: boolean
  welcome_letter?: Record<string, unknown> | null
  commission_rate: number | null
  address: string | null
  city: string | null
  state: string | null
  pincode: string | null
  /* Payout destination — member-editable, masked in the interface. */
  bank_holder?: string | null
  bank_name?: string | null
  bank_account?: string | null
  bank_ifsc?: string | null
  bank_type?: string | null
  upi_id?: string | null
  pan_number?: string | null
  bank_updated_at?: string | null
  notes: string | null
  approved_at: string | null
  last_login_at: string | null
  created_at: string
  rank?: Rank | null
  /** The rank slab bought at joining; see plan_rank_id. */
  plan_rank?: Rank | null
  manager?: Pick<Profile, 'id' | 'full_name'> | null
  referrer?: Pick<Profile, 'id' | 'full_name' | 'member_code'> | null
  placement_parent?: Pick<Profile, 'id' | 'full_name' | 'member_code'> | null
}

/** A node in the sponsor / placement genealogy, built client-side. */
export interface MemberNode {
  id: string
  member_code: string | null
  full_name: string
  rank_name: string | null
  status: AccountStatus
  role: AppRole
  direct_count: number
  team_count: number
  children: MemberNode[]
}

export interface Project {
  id: string
  slug: string
  name: string
  location: string
  city: string | null
  state: string | null
  description: string | null
  amenities: string[]
  hero_image: string | null
  gallery: string[]
  brochure_path: string | null
  map_embed: string | null
  price_from: number | null
  price_to: number | null
  size_from: number | null
  size_to: number | null
  size_unit: string
  published: boolean
  featured: boolean
  sort_order: number
  launch_date: string | null
  created_at: string
}

export interface Plot {
  id: string
  project_id: string
  number: string
  size: number | null
  size_unit: string
  dimensions: string | null
  facing: string | null
  price: number
  status: PlotStatus
  notes: string | null
  project?: Pick<Project, 'id' | 'name' | 'slug'> | null
}

export interface Lead {
  id: string
  owner_id: string | null
  name: string
  mobile: string
  email: string | null
  project_id: string | null
  category: string | null
  budget: number | null
  visit_date: string | null
  token_amount: number | null
  plot_number: string | null
  source: string
  remark: string | null
  status: LeadStatus
  next_follow_up: string | null
  converted_booking_id: string | null
  created_at: string
  project?: Pick<Project, 'id' | 'name'> | null
  owner?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface LeadActivity {
  id: string
  lead_id: string
  actor_id: string | null
  kind: string
  body: string
  created_at: string
  actor?: Pick<Profile, 'id' | 'full_name'> | null
}

export interface Booking {
  id: string
  reference: string
  plot_id: string
  project_id: string
  rep_id: string | null
  customer_id: string | null
  lead_id: string | null
  reviewer_id: string | null
  status: ApprovalStatus
  sale_value: number
  token_amount: number
  payment_plan: 'full' | 'emi'
  emi_count: number
  emi_amount: number
  emi_start: string | null
  terms_accepted_rep: boolean
  terms_accepted_customer: boolean
  step1_at: string | null
  step2_at: string | null
  step3_at: string | null
  reject_step: number | null
  reject_remark: string | null
  registry_path: string | null
  registry_at: string | null
  created_at: string
  plot?: Pick<Plot, 'id' | 'number' | 'size' | 'size_unit'> | null
  project?: Pick<Project, 'id' | 'name'> | null
  rep?: Pick<Profile, 'id' | 'full_name' | 'user_code'> | null
  customer?: Pick<Profile, 'id' | 'full_name' | 'user_code' | 'phone'> | null
}

export interface SaleConfirmation {
  id: string
  booking_id: string
  rep_id: string | null
  reviewer_id: string | null
  status: ApprovalStatus
  sale_value: number
  sale_date: string
  terms_accepted_rep: boolean
  terms_accepted_customer: boolean
  step1_at: string | null
  step2_at: string | null
  step3_at: string | null
  reject_step: number | null
  reject_remark: string | null
  created_at: string
  booking?: Booking | null
}

export interface Commission {
  id: string
  booking_id: string
  rep_id: string
  sale_value: number
  rate_applied: number
  rank_at_sale: string | null
  gross_amount: number
  deductions: number
  net_amount: number
  status: CommissionStatus
  approved_at: string | null
  paid_at: string | null
  payout_reference: string | null
  note: string | null
  created_at: string
  booking?: Pick<Booking, 'id' | 'reference'> | null
  rep?: Pick<Profile, 'id' | 'full_name' | 'user_code'> | null
}

export interface Emi {
  id: string
  booking_id: string
  seq: number
  due_date: string
  amount: number
  status: EmiStatus
  slip_path: string | null
  slip_uploaded_at: string | null
  paid_at: string | null
  verified_at: string | null
  reject_reason: string | null
  reference: string | null
  booking?: Pick<Booking, 'id' | 'reference' | 'customer_id' | 'rep_id'> | null
}

export interface Payment {
  id: string
  booking_id: string
  emi_id: string | null
  amount: number
  mode: string
  reference: string | null
  paid_on: string
  receipt_no: string | null
}

export interface DocumentRow {
  id: string
  booking_id: string | null
  owner_id: string | null
  type: DocType
  title: string
  storage_path: string
  size_bytes: number | null
  created_at: string
}

export interface Kyc {
  id: string
  user_id: string
  id_type: string
  id_last4: string | null
  id_doc_path: string | null
  address_doc_path: string | null
  photo_path: string | null
  status: KycStatus
  reviewed_at: string | null
  reject_reason: string | null
  created_at: string
  user?: Pick<Profile, 'id' | 'full_name' | 'user_code' | 'role'> | null
}

export interface MessageThread {
  id: string
  subject: string
  kind: ThreadKind
  status: ThreadStatus
  created_by: string | null
  assigned_to: string | null
  customer_id: string | null
  lead_id: string | null
  booking_id: string | null
  guest_name: string | null
  guest_email: string | null
  guest_phone: string | null
  last_message_at: string
  created_at: string
}

export interface Message {
  id: string
  thread_id: string
  sender_id: string | null
  body: string
  internal: boolean
  created_at: string
  sender?: Pick<Profile, 'id' | 'full_name' | 'role'> | null
}

export interface Notification {
  id: string
  user_id: string
  type: string
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export interface AuditEntry {
  id: number
  actor_id: string | null
  actor_role: AppRole | null
  action: 'insert' | 'update' | 'delete' | 'access' | 'login' | 'approve' | 'reject'
  entity: string
  entity_id: string | null
  summary: string | null
  before: Record<string, unknown> | null
  after: Record<string, unknown> | null
  at: string
}

export interface TeamCommissionTotal {
  rep_id: string
  rep_name: string
  accrued: number
  approved: number
  paid: number
  deals: number
}

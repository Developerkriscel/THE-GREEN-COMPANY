import { Navigate, Route, Routes } from 'react-router-dom'
import {
  BadgeCheck,
  Banknote,
  Bell,
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileText,
  Gauge,
  GitBranch,
  Inbox,
  KeyRound,
  Layers,
  LayoutGrid,
  ListChecks,
  Mail,
  Map,
  Network,
  Phone,
  Receipt,
  ScrollText,
  Settings,
  ShieldCheck,
  Trophy,
  TrendingUp,
  Gift,
  UserCircle,
  UserPlus,
  Users,
  Wallet,
} from 'lucide-react'

import { PublicLayout } from '@/components/layout/PublicLayout'
import { AppShell, type NavItem } from '@/components/layout/AppShell'
import { AnnouncementBar } from '@/components/AnnouncementBar'
import { RedirectIfAuthed, RequireAuth } from '@/routes/guards'

/* public */
import { Home } from '@/pages/public/Home'
import { ProjectsPage } from '@/pages/public/Projects'
import { ProjectDetail } from '@/pages/public/ProjectDetail'
import { ContactPage } from '@/pages/public/Contact'
import { AboutPage } from '@/pages/public/About'
import { PlansPage } from '@/pages/public/Plans'
import { RewardsPage } from '@/pages/public/Rewards'
import { GalleryPage } from '@/pages/public/Gallery'
import { EventsPage } from '@/pages/public/Events'
import { NewsPage } from '@/pages/public/News'
import { TeamPage } from '@/pages/public/Team'
import { CmsPage } from '@/pages/public/CmsPage'
import { NotFound } from '@/pages/public/NotFound'

/* auth */
import { StaffLogin } from '@/pages/auth/StaffLogin'
import { CustomerLogin } from '@/pages/auth/CustomerLogin'
import { RegisterRep } from '@/pages/auth/RegisterRep'
import { ForgotPassword } from '@/pages/auth/ForgotPassword'
import { ResetPassword } from '@/pages/auth/ResetPassword'

/* admin */
import { AdminDashboard } from '@/pages/admin/Dashboard'
import { AdminProjects } from '@/pages/admin/Projects'
import { AdminPlots } from '@/pages/admin/Plots'
import { AdminLeads } from '@/pages/admin/Leads'
import { AdminLeadConversion } from '@/pages/admin/LeadConversion'
import { AdminBookings } from '@/pages/admin/Bookings'
import { AdminSales } from '@/pages/admin/Sales'
import { AdminPlotSales } from '@/pages/admin/PlotSales'
import { AdminEmis } from '@/pages/admin/Emis'
import { AdminPaymentsCrm } from '@/pages/admin/PaymentsCrm'
import { AdminPayouts } from '@/pages/admin/Payouts'
import { AdminCommissions } from '@/pages/admin/Commissions'
import { AdminKyc } from '@/pages/admin/Kyc'
import { AdminRanks } from '@/pages/admin/Ranks'
import { AdminStaff } from '@/pages/admin/Staff'
import { AdminMembers } from '@/pages/admin/Members'
import { AdminMemberDetail } from '@/pages/admin/MemberDetail'
import { AdminMemberTree } from '@/pages/admin/MemberTree'
import { AdminGenealogy } from '@/pages/admin/Genealogy'
import { AdminAudit } from '@/pages/admin/Audit'
import { AdminCms } from '@/pages/admin/Cms'
import { AdminReports } from '@/pages/admin/Reports'

/* sponsor (member network panel) */
import { SponsorDashboard } from '@/pages/sponsor/Dashboard'
import { SponsorWallet } from '@/pages/sponsor/Wallet'
import { SponsorIncome } from '@/pages/sponsor/Income'
import { SponsorWithdrawals } from '@/pages/sponsor/Withdrawals'
import { SponsorTeam } from '@/pages/sponsor/Team'
import { SponsorTree } from '@/pages/sponsor/Tree'
import { SponsorRank } from '@/pages/sponsor/Rank'
import { SponsorRewards } from '@/pages/sponsor/Rewards'
import { SponsorSales, SponsorVerifiedSales } from '@/pages/sponsor/Sales'
import { SponsorRefer } from '@/pages/sponsor/Refer'
import { SponsorBankDetails } from '@/pages/sponsor/BankDetails'
import { SponsorNotifications } from '@/pages/sponsor/Notifications'
import { SponsorIdCard } from '@/pages/sponsor/IdCard'
import { SponsorLeads } from '@/pages/sponsor/Leads'
import { SponsorPayments } from '@/pages/sponsor/Payments'

/* The rep (/app), manager (/mgr) and customer (/portal) panels were retired
   on 2026-09-24: the business runs two panels, /admin and /sponsor. Their
   page files are still on disk under src/pages/{rep,manager,customer} but
   nothing routes to them. */

/* shared */
import { BookingDetail } from '@/pages/shared/BookingDetail'
import { LeadDetail } from '@/pages/shared/LeadDetail'
import { MessagesPage } from '@/pages/shared/Messages'
import { ProfilePage } from '@/pages/shared/Profile'
import { ChangePasswordPage } from '@/pages/shared/ChangePassword'
import { WelcomeLetterPage } from '@/pages/shared/WelcomeLetter'
import { DocumentsPage } from '@/pages/shared/Documents'
import { KycPage } from '@/pages/shared/Kyc'

const ico = 'h-4 w-4'

const adminNav: NavItem[] = [
  { to: '/admin', label: 'Dashboard', icon: <Gauge className={ico} />, end: true },
  { to: '/admin/cms', label: 'Website CMS', icon: <LayoutGrid className={ico} /> },
  { to: '/admin/members', label: 'Members', icon: <Users className={ico} /> },
  { to: '/admin/tree', label: 'Member Tree', icon: <Network className={ico} /> },
  { to: '/admin/genealogy', label: 'Genealogy', icon: <GitBranch className={ico} /> },
  { to: '/admin/sales', label: 'Plot Sales', icon: <BadgeCheck className={ico} /> },
  { to: '/admin/crm', label: 'Payments CRM', icon: <Wallet className={ico} /> },
  { to: '/admin/payouts', label: 'Payouts', icon: <Banknote className={ico} /> },
  { to: '/admin/leads', label: 'Lead Conversion', icon: <Phone className={ico} /> },
  { to: '/admin/messages', label: 'Inbox', icon: <Inbox className={ico} /> },
  { to: '/admin/kyc', label: 'KYC Verifications', icon: <ShieldCheck className={ico} /> },
  { to: '/admin/profile', label: 'My Profile', icon: <UserCircle className={ico} /> },
  { to: '/admin/password', label: 'Change Password', icon: <KeyRound className={ico} /> },
]

// Kept reachable by URL (booking flow, inventory, back-office) but off the
// primary sidebar so it mirrors the production Royal Green console.
const adminSecondaryNav: NavItem[] = [
  { to: '/admin/projects', label: 'Projects', icon: <Building2 className={ico} /> },
  { to: '/admin/plots', label: 'Plot inventory', icon: <Map className={ico} /> },
  { to: '/admin/bookings', label: 'Bookings', icon: <ClipboardCheck className={ico} /> },
  { to: '/admin/emis', label: 'EMI schedule', icon: <CalendarClock className={ico} /> },
  { to: '/admin/commissions', label: 'Commissions', icon: <Banknote className={ico} /> },
  { to: '/admin/ranks', label: 'Ranks', icon: <Trophy className={ico} /> },
  { to: '/admin/staff', label: 'Staff', icon: <Users className={ico} /> },
  { to: '/admin/reports', label: 'Reports', icon: <FileText className={ico} /> },
  { to: '/admin/audit', label: 'Audit log', icon: <ScrollText className={ico} /> },
]
void adminSecondaryNav

// The member's own network business. A member signs in as `rep` and lands
// here; the single-level sales workspace below stays reachable at /app.
const sponsorNav: NavItem[] = [
  { to: '/sponsor', label: 'Dashboard', icon: <Gauge className={ico} />, end: true },
  { to: '/sponsor/sales', label: 'Plot Sales', icon: <BadgeCheck className={ico} /> },
  { to: '/sponsor/verified-sales', label: 'Verified Sales', icon: <ClipboardCheck className={ico} /> },
  { to: '/sponsor/payments', label: 'Payments', icon: <Receipt className={ico} /> },
  { to: '/sponsor/leads', label: 'Lead Follow-up', icon: <Phone className={ico} /> },
  { to: '/sponsor/wallet', label: 'My Wallet', icon: <Wallet className={ico} /> },
  { to: '/sponsor/income/direct', label: 'Direct Income', icon: <TrendingUp className={ico} /> },
  { to: '/sponsor/income/level', label: 'Level Income', icon: <Layers className={ico} /> },
  { to: '/sponsor/withdrawals', label: 'Withdrawals', icon: <Banknote className={ico} /> },
  { to: '/sponsor/team', label: 'My Team', icon: <Users className={ico} /> },
  { to: '/sponsor/tree', label: 'Genealogy', icon: <GitBranch className={ico} /> },
  { to: '/sponsor/rank', label: 'Rank & Progress', icon: <Trophy className={ico} /> },
  { to: '/sponsor/rewards', label: 'Rewards', icon: <Gift className={ico} /> },
  { to: '/sponsor/refer', label: 'Refer a Member', icon: <UserPlus className={ico} /> },
  { to: '/sponsor/kyc', label: 'KYC', icon: <ShieldCheck className={ico} /> },
  { to: '/sponsor/documents', label: 'Documents', icon: <FileText className={ico} /> },
  { to: '/sponsor/welcome', label: 'Welcome Letter', icon: <Mail className={ico} /> },
  { to: '/sponsor/id-card', label: 'My ID Card', icon: <BadgeCheck className={ico} /> },
  { to: '/sponsor/messages', label: 'Support', icon: <Inbox className={ico} /> },
  { to: '/sponsor/notifications', label: 'Notifications', icon: <Bell className={ico} /> },
  { to: '/sponsor/bank', label: 'Profile & Bank', icon: <UserCircle className={ico} /> },
  { to: '/sponsor/password', label: 'Change Password', icon: <KeyRound className={ico} /> },
]

export function App() {
  return (
    <Routes>
      {/* ------------------------------------------------ public website */}
      <Route element={<PublicLayout />}>
        <Route index element={<Home />} />
        <Route path="projects" element={<ProjectsPage />} />
        <Route path="projects/:slug" element={<ProjectDetail />} />
        <Route path="contact" element={<ContactPage />} />
        <Route path="about" element={<AboutPage />} />
        <Route path="plans" element={<PlansPage />} />
        <Route path="rewards" element={<RewardsPage />} />
        <Route path="gallery" element={<GalleryPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="news" element={<NewsPage />} />
        <Route path="team" element={<TeamPage />} />
        <Route path="page/:slug" element={<CmsPage />} />
      </Route>

      {/* --------------------------------------------------- auth pages */}
      <Route element={<RedirectIfAuthed />}>
        {/* The paths the live site uses. */}
        <Route path="/admin-login" element={<StaffLogin />} />
        <Route path="/sponsor-login" element={<CustomerLogin />} />
        <Route path="/join" element={<RegisterRep />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />

        {/* Earlier paths, kept so links already sent out still work. */}
        <Route path="/login" element={<Navigate to="/admin-login" replace />} />
        <Route path="/portal/login" element={<Navigate to="/sponsor-login" replace />} />
        <Route path="/register" element={<Navigate to="/join" replace />} />
      </Route>
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* -------------------------------------------------------- admin */}
      <Route element={<RequireAuth roles={['admin']} />}>
        <Route path="/admin" element={<AppShell nav={adminNav} area="Administration" />}>
          <Route index element={<AdminDashboard />} />
          <Route path="cms" element={<AdminCms />} />
          <Route path="members" element={<AdminMembers />} />
          <Route path="members/:code" element={<AdminMemberDetail />} />
          <Route path="tree" element={<AdminMemberTree />} />
          <Route path="genealogy" element={<AdminGenealogy />} />
          <Route path="sales" element={<AdminPlotSales />} />
          <Route path="confirmations" element={<AdminSales />} />
          <Route path="crm" element={<AdminPaymentsCrm />} />
          <Route path="payouts" element={<AdminPayouts />} />
          <Route path="leads" element={<AdminLeadConversion />} />
          <Route path="leads/:id" element={<LeadDetail />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="messages/:id" element={<MessagesPage />} />
          <Route path="kyc" element={<AdminKyc />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="password" element={<ChangePasswordPage />} />

          {/* secondary — reachable by URL, not on the primary sidebar */}
          <Route path="projects" element={<AdminProjects />} />
          <Route path="plots" element={<AdminPlots />} />
          <Route path="leads-classic" element={<AdminLeads />} />
          <Route path="bookings" element={<AdminBookings />} />
          <Route path="bookings/:id" element={<BookingDetail />} />
          <Route path="emis" element={<AdminEmis />} />
          <Route path="commissions" element={<AdminCommissions />} />
          <Route path="ranks" element={<AdminRanks />} />
          <Route path="staff" element={<AdminStaff />} />
          <Route path="reports" element={<AdminReports />} />
          <Route path="audit" element={<AdminAudit />} />
        </Route>
      </Route>


      {/* -------------------------------------------------- sponsor panel */}
      <Route element={<RequireAuth roles={['rep']} />}>
        <Route path="/sponsor" element={<AppShell nav={sponsorNav} area="Sponsor" banner={<AnnouncementBar />} />}>
          <Route index element={<SponsorDashboard />} />
          <Route path="wallet" element={<SponsorWallet />} />
          <Route path="income" element={<SponsorIncome />} />
          {/* Keyed so switching between the two remounts and picks up the tab. */}
          <Route path="income/direct" element={<SponsorIncome key="direct" initialTab="Direct" />} />
          <Route path="income/level" element={<SponsorIncome key="level" initialTab="Level" />} />
          <Route path="leads" element={<SponsorLeads />} />
          <Route path="payments" element={<SponsorPayments />} />
          <Route path="withdrawals" element={<SponsorWithdrawals />} />
          <Route path="team" element={<SponsorTeam />} />
          <Route path="tree" element={<SponsorTree />} />
          <Route path="rank" element={<SponsorRank />} />
          <Route path="rewards" element={<SponsorRewards />} />
          <Route path="sales" element={<SponsorSales />} />
          <Route path="verified-sales" element={<SponsorVerifiedSales />} />
          <Route path="refer" element={<SponsorRefer />} />
          <Route path="bank" element={<SponsorBankDetails />} />
          <Route path="kyc" element={<KycPage />} />
          <Route path="documents" element={<DocumentsPage />} />
          <Route path="id-card" element={<SponsorIdCard />} />
          <Route path="notifications" element={<SponsorNotifications />} />
          <Route path="welcome" element={<WelcomeLetterPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="password" element={<ChangePasswordPage />} />
          <Route path="messages" element={<MessagesPage />} />
          <Route path="messages/:id" element={<MessagesPage />} />
        </Route>
      </Route>

      {/* Old panel paths. The business runs two panels -- admin and sponsor --
          so anything aimed at the retired ones lands on the sponsor panel. */}
      <Route path="/messages/:id" element={<Navigate to="/sponsor/messages" replace />} />
      <Route path="/app/*" element={<Navigate to="/sponsor" replace />} />
      <Route path="/mgr/*" element={<Navigate to="/sponsor" replace />} />
      <Route path="/portal/*" element={<Navigate to="/sponsor" replace />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  )
}

import { BookingsView } from '@/pages/shared/BookingsView'

export function TeamApprovals() {
  return (
    <BookingsView
      title="Awaiting your review"
      description="Step 2 of the approval chain. Approve or reject with a remark; final approval rests with an administrator."
      basePath="/mgr/bookings"
      defaultStatus="step1_done"
    />
  )
}

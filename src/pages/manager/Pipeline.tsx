import { BookingsView } from '@/pages/shared/BookingsView'

export function TeamPipeline() {
  return (
    <BookingsView
      title="Team pipeline"
      description="Read-only view of your reps' bookings, for coordination. You earn nothing from these sales."
      basePath="/mgr/bookings"
    />
  )
}

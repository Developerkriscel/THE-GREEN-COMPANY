import { BookingsView } from '@/pages/shared/BookingsView'

export function AdminBookings() {
  return (
    <BookingsView
      title="Bookings"
      description="Every token and booking in the system. Final approval is yours alone."
      basePath="/admin/bookings"
    />
  )
}

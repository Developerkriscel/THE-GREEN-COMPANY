import { Printer } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useMemberById, useSiteSetting } from '@/lib/queries'
import { Button, PageHeader, Spinner } from '@/components/ui'
import { resolveWelcomeLetter, WelcomeLetterView, type WelcomeLetter } from '@/lib/welcome-letter'

/**
 * The member-facing welcome letter. Uses the member's per-member override if an
 * admin saved one, otherwise the CMS default template, with placeholders filled
 * from the signed-in member's profile.
 */
export function WelcomeLetterPage() {
  const { session } = useAuth()
  const { data: member, isLoading } = useMemberById(session?.user?.id)
  const { data: defaultTpl } = useSiteSetting('welcome.letter')

  if (isLoading) return <Spinner label="Preparing your welcome letter…" />

  const stored = (member?.welcome_letter as Partial<WelcomeLetter> | null) ?? (defaultTpl as Partial<WelcomeLetter> | null)
  const letter = resolveWelcomeLetter(stored)

  return (
    <div>
      <PageHeader
        title="Welcome Letter"
        description="Your official welcome letter from Royal Green Company."
        action={<Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>}
      />
      <WelcomeLetterView letter={letter} member={member} />
    </div>
  )
}

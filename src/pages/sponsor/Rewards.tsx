import { Gift } from 'lucide-react'
import { useAuth } from '@/context/AuthContext'
import { useCmsContent } from '@/lib/queries'
import { useMySales, useRankLadder, confirmedArea, rewardTiers } from '@/lib/sponsor'
import { rewardReference, useIssuedRewards, useMyRewardArea } from '@/lib/sponsor-crm'
import { Badge, Card, CardHeader, EmptyState, PageHeader } from '@/components/ui'
import { ProgressBar, SkeletonRows } from '@/components/sponsor'
import { date, num } from '@/lib/format'

/**
 * Module 8 — the reward ladder, with the distance to the next prize stated in
 * the unit the member controls: area sold.
 *
 * Progress is cumulative and lifetime. Reaching a tier does not consume the
 * area — a member at 2,000 sq yd has met the 500, 1,000 and 2,000 tiers and is
 * 2,000 of the way toward 5,000, not back at zero.
 *
 * Only area on sales that are at least HALF PAID counts (plan deck slide 7,
 * "Reward Count After 50% payment"). Confirmed-but-unpaid area is shown
 * alongside so the member can see what is waiting on collection rather than
 * wondering why the figure looks low.
 */
export function SponsorRewards() {
  const { profile } = useAuth()
  const me = profile?.id

  const { data: sales = [], isLoading: salesLoading } = useMySales(me)
  const { data: ladder = [], isLoading: ladderLoading } = useRankLadder()
  const { data: qualifying = 0, isLoading: areaLoading } = useMyRewardArea(me)
  const { data: issued = [] } = useIssuedRewards(me)
  // Pictures come from the company's reward library in the Website CMS.
  const { data: cms = [] } = useCmsContent<{ id: string; title: string; image_url: string; sales: string }>(
    'rewards',
    { activeOnly: true },
  )

  // Both inputs must be in before any figure is shown: a half-loaded screen
  // would tell the member their first reward is further away than it is.
  if (salesLoading || ladderLoading || areaLoading || ladder.length === 0) {
    return (
      <>
        <PageHeader title="Rewards" description="The gift and car programme, and how close you are to the next one." />
        <Card>
          <SkeletonRows rows={6} />
        </Card>
      </>
    )
  }

  // `area` is what counts toward a reward; `confirmed` is everything sold.
  // The gap between them is sale value still to be collected.
  const area = qualifying
  const confirmed = confirmedArea(sales)
  const awaitingPayment = Math.max(0, confirmed - area)
  const tiers = rewardTiers(ladder, area)
  // Earned and issued are different facts: one is the member's achievement,
  // the other is whether the goods actually arrived.
  const issuedAt = new Map(issued.map((r) => [r.reference, r.issued_at]))
  const issuedOn = (title: string, sqyd: number) => issuedAt.get(rewardReference(title, sqyd))

  const next = tiers.find((t) => !t.earned)
  const earnedCount = tiers.filter((t) => t.earned).length

  const imageFor = (title: string) =>
    cms.find((c) => c.title?.toLowerCase().includes(title.toLowerCase().split(' ')[0]))?.image_url

  return (
    <>
      <PageHeader title="Rewards" description="The gift and car programme, and how close you are to the next one." />

      {/* --- one line the member can act on -------------------------------- */}
      <Card className="mb-6">
        <div className="p-5">
          <p className="text-lg font-semibold text-slate-900">
            {num(area)} sq yd counting
            {next ? (
              <>
                {' · '}
                <span className="text-brand-700">
                  {num(next.targetSqyd - area)} sq yd to the {next.title}
                </span>
              </>
            ) : tiers.length ? (
              ' · every reward earned'
            ) : null}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Area counts toward a reward once at least half the sale value has been received.
            {awaitingPayment > 0 && (
              <>
                {' '}
                <span className="font-medium text-amber-700">
                  {num(awaitingPayment)} sq yd is waiting on payment
                </span>{' '}
                and will count as the money comes in.
              </>
            )}
          </p>
          {next && (
            <>
              <div className="mt-3">
                <ProgressBar percent={next.progress} />
              </div>
              <p className="mt-1.5 text-xs text-slate-500">
                {num(area)} of {num(next.targetSqyd)} sq yd toward {next.title}
              </p>
            </>
          )}
          {!next && tiers.length > 0 && (
            <p className="mt-2 text-sm text-emerald-700">
              You’ve earned every reward in the programme.
            </p>
          )}
          {area === 0 && tiers.length > 0 && (
            <p className="mt-2 text-sm text-slate-600">
              Your first reward is {num(tiers[0].targetSqyd)} sq yd away.
            </p>
          )}
        </div>
      </Card>

      {tiers.length === 0 ? (
        <Card>
          <EmptyState
            title="No reward tiers configured yet"
            description="The company sets the reward ladder. It will appear here once it is published."
          />
        </Card>
      ) : (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">
              Reward tiers ({num(earnedCount)} of {num(tiers.length)} earned)
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tiers.map((t) => {
              // Compare identity, not target: three tiers share 100 sq yd, so
              // matching on the value marked all three as "Next".
              const isNext = next?.seniority === t.seniority
              const img = imageFor(t.title)
              return (
                <Card
                  key={`${t.seniority}-${t.title}`}
                  className={`overflow-hidden ${isNext ? 'ring-2 ring-brand-500' : ''}`}
                >
                  {img ? (
                    <img src={img} alt={t.title} className="h-28 w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex h-28 w-full items-center justify-center bg-slate-100">
                      <Gift className="h-8 w-8 text-slate-300" />
                    </div>
                  )}
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">{t.title}</p>
                      {t.earned && issuedOn(t.title, t.targetSqyd) ? (
                        <Badge tone="green">Issued</Badge>
                      ) : t.earned ? (
                        <Badge tone="amber">Earned</Badge>
                      ) : isNext ? (
                        <Badge tone="amber">Next</Badge>
                      ) : (
                        <Badge tone="neutral">Locked</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Target {num(t.targetSqyd)} sq yd</p>
                    <div className="mt-3">
                      <ProgressBar percent={t.progress} tone={t.earned ? 'green' : 'brand'} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-slate-500">
                      {num(Math.min(area, t.targetSqyd))} of {num(t.targetSqyd)} sq yd
                    </p>
                    {t.earned && (
                      issuedOn(t.title, t.targetSqyd) ? (
                        <p className="mt-2 rounded bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">
                          Issued on {date(issuedOn(t.title, t.targetSqyd)!)}.
                        </p>
                      ) : (
                        <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">
                          Earned. The office will contact you about delivery.
                        </p>
                      )
                    )}
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Reward progress counts your own confirmed sales once at least half the sale value has been
        received, and is cumulative for life. A cancelled sale removes its area from the total.
        Rewards given as goods are marked “awarded in kind” under Income and are not credited to
        your wallet.
      </p>
    </>
  )
}

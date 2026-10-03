import { useAuth } from '@/context/AuthContext'
import { useCmsContent } from '@/lib/queries'
import { useRankLadder, rewardTarget, rewardTiers, type RewardTier } from '@/lib/sponsor'
import { rewardReference, useIssuedRewards, useMyRewardProgress } from '@/lib/sponsor-crm'
import { assetUrl } from '@/lib/supabase'
import { Badge, Card, EmptyState, PageHeader } from '@/components/ui'
import { RewardArt } from '@/components/RewardArt'
import { ProgressBar, SkeletonRows } from '@/components/sponsor'
import { date, num } from '@/lib/format'

/**
 * Module 8 — the reward ladder, as the plan deck's slide 8 "Reward Income".
 *
 * Every reward needs two things at once: D sq yd of the member's OWN sales
 * (direct) and G sq yd of their TEAM's sales (group), e.g. Juicer at
 * 50 direct + 100 group. Only sales booked in the reward period count, and
 * only once at least half the sale value is received ("Reward Count After
 * 50% payment", "4 months wise"). Both figures come from
 * my_reward_progress(); what is still waiting on payment is shown beside them
 * so a low figure is explained rather than puzzling.
 */
export function SponsorRewards() {
  const { profile } = useAuth()
  const me = profile?.id

  const { data: ladder = [], isLoading: ladderLoading } = useRankLadder()
  const { data: progress, isLoading: progressLoading } = useMyRewardProgress(me)
  const { data: issued = [] } = useIssuedRewards(me)
  // Pictures come from the company's reward library in the Website CMS.
  const { data: cms = [] } = useCmsContent<{ id: string; title: string; image_url: string | null; joining: string | null }>('rewards', { activeOnly: true })

  if (ladderLoading || progressLoading || !progress || ladder.length === 0) {
    return (
      <>
        <PageHeader title="Rewards" description="The gift and car programme, and how close you are to the next one." />
        <Card><SkeletonRows rows={6} /></Card>
      </>
    )
  }

  const { direct, group, directPending, groupPending, periodStart, periodEnd, minPaidPct } = progress
  const tiers = rewardTiers(ladder, direct, group)
  const issuedAt = new Map(issued.map((r) => [r.reference, r.issued_at]))
  const issuedOn = (t: RewardTier) => issuedAt.get(rewardReference(t.title, t.targetSqyd))
  const next = tiers.find((t) => !t.earned)
  const earnedCount = tiers.filter((t) => t.earned).length
  const period = periodStart && periodEnd ? `${date(periodStart)} – ${date(periodEnd)}` : periodStart ? `from ${date(periodStart)}` : 'all time'
  // A photo the office put on the matching reward in the Website CMS, if any.
  const imageFor = (t: RewardTier) => {
    const hit = cms.find((c) => c.image_url && c.title.trim().toLowerCase() === t.title.trim().toLowerCase()
      && (!c.joining || c.joining.trim().toLowerCase() === t.rankName.trim().toLowerCase()))
    return hit ? assetUrl(hit.image_url) : null
  }

  return (
    <>
      <PageHeader title="Rewards" description="The gift and car programme, and how close you are to the next one." />

      {/* --- where the member stands ---------------------------------------- */}
      <Card className="mb-6">
        <div className="p-5">
          <p className="text-xs font-semibold uppercase tracking-wider text-brand-gold-deep">Reward period · {period}</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Figure label="Your own sales (direct)" value={direct} pending={directPending} />
            <Figure label="Your team's sales (group)" value={group} pending={groupPending} />
          </div>

          {next ? (
            <div className="mt-4 rounded-xl bg-brand-gold/[0.07] p-4 ring-1 ring-brand-gold/20">
              <p className="text-sm font-semibold text-slate-900">
                Next: <span className="text-brand-700">{next.title}</span>
                <span className="font-normal text-slate-500"> ({next.rankName}) — needs {rewardTarget(next)}</span>
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {[
                  next.targetSqyd > direct && `${num(next.targetSqyd - direct)} sq yd more of your own sales`,
                  next.targetGroup > group && `${num(next.targetGroup - group)} sq yd more from your team`,
                ].filter(Boolean).join(' and ')} to go.
              </p>
              <TwoBars tier={next} direct={direct} group={group} />
            </div>
          ) : tiers.length ? (
            <p className="mt-4 text-sm text-emerald-700">You’ve earned every reward in this period.</p>
          ) : null}

          <p className="mt-3 text-xs text-slate-500">
            A sale counts once at least {num(minPaidPct)}% of its value has been received, and only if it was booked in
            the reward period. Your team is everyone you sponsored, and everyone they sponsored, at every level.
          </p>
        </div>
      </Card>

      {tiers.length === 0 ? (
        <Card>
          <EmptyState title="No rewards configured yet" description="The company sets the reward ladder. It will appear here once it is published." />
        </Card>
      ) : (
        <>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Rewards ({num(earnedCount)} of {num(tiers.length)} earned)</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {tiers.map((t) => {
              const isNext = next?.seniority === t.seniority
              const img = imageFor(t)
              const on = t.earned ? issuedOn(t) : undefined
              return (
                <Card key={`${t.seniority}-${t.title}`} className={`overflow-hidden ${isNext ? 'ring-2 ring-brand-500' : ''}`}>
                  <div className="relative">
                    {img
                      ? <img src={img} alt={t.title} className="h-28 w-full object-cover" loading="lazy" />
                      : <RewardArt title={t.title} />}
                    <span className="absolute left-2 top-2 rounded-full bg-gold-metal px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand-darker shadow">
                      {t.rankName}
                    </span>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-bold text-slate-900">{t.title}</p>
                      {on ? <Badge tone="green">Issued</Badge>
                        : t.earned ? <Badge tone="amber">Earned</Badge>
                          : isNext ? <Badge tone="amber">Next</Badge>
                            : <Badge tone="neutral">Locked</Badge>}
                    </div>
                    <p className="mt-1 text-xs text-slate-500">Needs {rewardTarget(t)}</p>
                    <TwoBars tier={t} direct={direct} group={group} compact />
                    {t.earned && (on ? (
                      <p className="mt-2 rounded bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800">Issued on {date(on)}.</p>
                    ) : (
                      <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-[11px] text-amber-800">Earned. The office will contact you about delivery.</p>
                    ))}
                  </div>
                </Card>
              )
            })}
          </div>
        </>
      )}

      <p className="mt-6 text-xs text-slate-500">
        Rewards follow the company's Reward Income plan: own (direct) and team (group) sales in square yards, counted
        after {num(minPaidPct)}% payment, in 4-month periods. A cancelled sale removes its area. Rewards given as goods
        are marked “awarded in kind” under Income and are not credited to your wallet.
      </p>
    </>
  )
}

function Figure({ label, value, pending }: { label: string; value: number; pending: number }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900">{num(value)} <span className="text-sm font-medium text-slate-500">sq yd counting</span></p>
      {pending > 0 && <p className="mt-0.5 text-xs font-medium text-amber-700">+ {num(pending)} sq yd waiting on payment</p>}
    </div>
  )
}

/** One bar for own sales, one for the team's: a reward needs both full. */
export function TwoBars({ tier: t, direct, group, compact = false }: { tier: RewardTier; direct: number; group: number; compact?: boolean }) {
  return (
    <div className={compact ? 'mt-3 space-y-2' : 'mt-3 grid gap-3 sm:grid-cols-2'}>
      <div>
        <ProgressBar percent={t.directProgress} tone={t.directProgress >= 100 ? 'green' : 'brand'} />
        <p className="mt-1 text-[11px] text-slate-500">Own: {num(Math.min(direct, t.targetSqyd))} of {num(t.targetSqyd)} sq yd</p>
      </div>
      {t.targetGroup > 0 && (
        <div>
          <ProgressBar percent={t.groupProgress} tone={t.groupProgress >= 100 ? 'green' : 'brand'} />
          <p className="mt-1 text-[11px] text-slate-500">Team: {num(Math.min(group, t.targetGroup))} of {num(t.targetGroup)} sq yd</p>
        </div>
      )}
    </div>
  )
}

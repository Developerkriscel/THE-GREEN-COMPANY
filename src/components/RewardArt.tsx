import {
  Award, Bike, Car, Gift, Laptop, Smartphone, Soup, Trophy, Utensils,
} from 'lucide-react'

/**
 * What a reward tier looks like before anyone has uploaded a photograph.
 *
 * Every tier used to fall back to the same grey gift box, so a screen of
 * eleven rewards read as eleven identical cards. These are not photographs
 * and are not pretending to be — they are a distinct mark per prize, chosen
 * from the title, so the ladder is legible at a glance and a real photo can
 * replace any of them the moment the office uploads one.
 */

const MATCHERS: Array<[RegExp, typeof Gift, string]> = [
  [/juicer|blender|mixer|grinder/i, Soup, 'from-amber-100 to-orange-100 text-orange-500'],
  [/phone|mobile|iphone/i, Smartphone, 'from-slate-100 to-blue-100 text-blue-500'],
  [/laptop|computer/i, Laptop, 'from-slate-100 to-indigo-100 text-indigo-500'],
  [/bike|bullet|scooter|enfield/i, Bike, 'from-stone-100 to-red-100 text-red-500'],
  [/car|brezza|ertiga|fortuner/i, Car, 'from-emerald-100 to-teal-100 text-emerald-600'],
  [/trip|goa|thailand|darjeeling|tour/i, Trophy, 'from-sky-100 to-cyan-100 text-cyan-600'],
  [/cook|utensil|kitchen/i, Utensils, 'from-amber-100 to-yellow-100 text-amber-600'],
  [/induction|award|recognition/i, Award, 'from-violet-100 to-fuchsia-100 text-violet-500'],
]

export function rewardArt(title: string) {
  for (const [re, Icon, skin] of MATCHERS) {
    if (re.test(title)) return { Icon, skin }
  }
  return { Icon: Gift, skin: 'from-slate-100 to-slate-200 text-slate-400' }
}

/**
 * The placeholder panel itself. `className` carries the height so a card and
 * a compact admin tile can share it.
 */
export function RewardArt({ title, className = 'h-28' }: { title: string; className?: string }) {
  const { Icon, skin } = rewardArt(title)
  return (
    <div
      className={`flex w-full items-center justify-center bg-gradient-to-br ${skin} ${className}`}
      role="img"
      aria-label={title}
    >
      <Icon className="h-9 w-9" strokeWidth={1.5} />
    </div>
  )
}

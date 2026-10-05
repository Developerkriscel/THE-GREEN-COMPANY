/**
 * Credits for the reward photos shipped with the site (public/rewards/*.jpg).
 * All are freely licensed on Wikimedia Commons and were cropped to 4:3; the
 * CC BY / BY-SA licences require the author, licence and source be shown,
 * which the Rewards page does. A photo the office uploads in Website CMS ->
 * Rewards has no entry here and is shown without a credit.
 */
export interface PhotoCredit {
  author: string
  license: 'CC0' | 'CC BY-SA 3.0' | 'CC BY-SA 4.0'
  source: string
}

const LICENSE_URL: Record<PhotoCredit['license'], string> = {
  CC0: 'https://creativecommons.org/publicdomain/zero/1.0/',
  'CC BY-SA 3.0': 'https://creativecommons.org/licenses/by-sa/3.0/',
  'CC BY-SA 4.0': 'https://creativecommons.org/licenses/by-sa/4.0/',
}
export const licenseUrl = (l: PhotoCredit['license']) => LICENSE_URL[l]

const C = 'https://commons.wikimedia.org/wiki/File:'
export const REWARD_PHOTO_CREDITS: Record<string, PhotoCredit> = {
  '/rewards/induction.jpg': { author: 'OtivrGlobal', license: 'CC BY-SA 4.0', source: `${C}Otivr_pre-launch_event_and_seminar_co-hosted_by_the_Swedish_Chamber_of_Commerce_India_and_Business_Sweden.jpg` },
  '/rewards/juicer.jpg': { author: 'Mcapdevila', license: 'CC BY-SA 3.0', source: `${C}Liquadora.JPG` },
  '/rewards/mixer.jpg': { author: 'Vimkay', license: 'CC BY-SA 4.0', source: `${C}A_table-top_mixer-grinder_or_mixie.jpg` },
  '/rewards/phone-10k-a.jpg': { author: '洛微', license: 'CC BY-SA 4.0', source: `${C}Redmi_Note_9_4G.jpg` },
  '/rewards/phone-10k-b.jpg': { author: '洛微', license: 'CC BY-SA 4.0', source: `${C}Back_of_Redmi_9_sample_in_China_20210307.jpg` },
  '/rewards/phone-15k.jpg': { author: 'Petar Milošević', license: 'CC BY-SA 4.0', source: `${C}Xiaomi_Redmi_Note_10_Pro.jpg` },
  '/rewards/phone-20k.jpg': { author: 'Maksdroider', license: 'CC BY-SA 4.0', source: `${C}REDMI_Note_15_and_REDMI_Note_15_5G_back.jpg` },
  '/rewards/laptop.jpg': { author: 'Norbert Levajsics', license: 'CC0', source: `${C}Laptop_on_a_neat_desk_(Unsplash).jpg` },
  '/rewards/car-5l.jpg': { author: 'Vis M', license: 'CC BY-SA 4.0', source: `${C}Maruti_Suzuki_Alto_K10.jpg` },
  '/rewards/car-7l.jpg': { author: 'Premnath Kudva', license: 'CC BY-SA 3.0', source: `${C}Maruti_Suzuki_Swift_2092.JPG` },
  '/rewards/car-10l.jpg': { author: 'Blthippeswamy', license: 'CC0', source: `${C}2026_maruti_brezza_facelift_introduction_01.jpg` },
  '/rewards/car-12l.jpg': { author: 'Akashpbrahmavar', license: 'CC0', source: `${C}Maruti_Suzuki_Ertiga(1).jpg` },
}

/** The credit for a reward photo URL (absolute or site-relative), if it is one of ours. */
export function rewardPhotoCredit(url: string | null | undefined): PhotoCredit | null {
  if (!url) return null
  const m = url.match(/\/rewards\/[\w-]+\.jpg$/)
  return m ? REWARD_PHOTO_CREDITS[m[0]] ?? null : null
}

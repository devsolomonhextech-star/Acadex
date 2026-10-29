/**
 * The three photographs used by the landing hero carousel, with the copy each
 * one pairs with. Every image is a local copy of a Pexels photo; see
 * `public/landing/CREDITS.md` for the source and licence of each one.
 */
export type HeroSlide = {
  id: 'calm' | 'fees' | 'progress'
  img: string
  alt: string
  eyebrow: string
  title: string
  pill: string
  position: string
}

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: 'calm',
    img: '/landing/hero-parent-phone.jpg',
    alt: 'A parent smiling as she checks her phone',
    eyebrow: 'Peace of mind',
    title: 'School, in real time',
    pill: '96% attendance',
    position: '50% 45%',
  },
  {
    id: 'fees',
    img: '/landing/hero-parent-fees.jpg',
    alt: 'A parent paying a school bill on her phone',
    eyebrow: 'Fees in one tap',
    title: 'Pay, keep the receipt',
    pill: 'GH₵ 1,250 paid',
    position: '50% 46%',
  },
  {
    id: 'progress',
    img: '/landing/hero-parent-child.jpg',
    alt: 'A parent and her child working through schoolwork together',
    eyebrow: 'Progress at a glance',
    title: 'Results as they land',
    pill: 'Grade A · Term 2',
    position: '52% 50%',
  },
]

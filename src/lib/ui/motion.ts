// Shared framer-motion presets so motion stays consistent app-wide instead of every component
// hand-rolling its own durations and easings. Keep these few and reuse them — a small motion
// vocabulary is what makes a UI feel designed rather than busy. Easing matches the warm-paper,
// unhurried feel: short, soft, no bounce except where a moment earns it.

import type { Variants, Transition } from 'framer-motion'

/** The house easing — a gentle ease-out, same curve the Progress count-up uses. */
export const EASE_OUT: Transition['ease'] = [0.16, 1, 0.3, 1]

/** Fade + rise. The default entrance for cards, panels, and hero elements. */
export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE_OUT } },
}

/** A container that staggers its children's entrances — wrap a list/grid in this. */
export const stagger: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
}

/** A list/grid item meant to sit inside a `stagger` container. */
export const staggerItem: Variants = {
  hidden: { opacity: 0, y: 14 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: EASE_OUT } },
}

/** Tasteful lift + tap feedback for interactive cards. Spread onto a `motion` element. */
export const liftOnHover = {
  whileHover: { y: -3, transition: { duration: 0.18, ease: EASE_OUT } },
  whileTap: { scale: 0.985 },
} as const

/** Per-route page transition for the main outlet. */
export const pageTransition: Variants = {
  hidden: { opacity: 0, y: 8 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3, ease: EASE_OUT } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.2, ease: EASE_OUT } },
}

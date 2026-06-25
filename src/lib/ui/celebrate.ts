import confetti from 'canvas-confetti'

// Celebration bursts for the moments worth celebrating — a round passed, a rank-up, the day's
// prep finished. Themed to the app's terracotta/warm palette so it reads as "us", not a generic
// party. Honors prefers-reduced-motion: if the user opted out of motion, we stay quiet.

const WARM = ['#c66337', '#b5552f', '#e5a883', '#d88157', '#fcf5f0', '#10b981']

const reducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** A quick, modest burst — the everyday win (a task or round completed). */
export function celebrate(): void {
  if (reducedMotion()) return
  confetti({
    particleCount: 70,
    spread: 64,
    startVelocity: 38,
    origin: { y: 0.7 },
    colors: WARM,
    scalar: 0.9,
    disableForReducedMotion: true,
  })
}

/** A bigger, two-sided cannon for the rare, earned moments (rank-up, offer, day complete). */
export function celebrateBig(): void {
  if (reducedMotion()) return
  const base = { spread: 70, startVelocity: 45, colors: WARM, disableForReducedMotion: true }
  confetti({ ...base, particleCount: 90, origin: { x: 0.15, y: 0.65 }, angle: 60 })
  confetti({ ...base, particleCount: 90, origin: { x: 0.85, y: 0.65 }, angle: 120 })
}

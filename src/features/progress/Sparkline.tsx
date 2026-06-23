import type { Point } from './trends'

// A dependency-free inline-SVG line chart. Uses a fixed viewBox scaled to 100% width with
// non-scaling strokes, so it stays crisp at any size without a charting library. Domain
// [min,max] is supplied by the caller (e.g. 1..5 for levels, 0..max for filler rate).

interface Props {
  points: Point[]
  min: number
  max: number
  /** Tailwind stroke/fill color class hue, e.g. 'terracotta' | 'emerald' | 'rose'. */
  color?: 'terracotta' | 'emerald' | 'rose' | 'violet'
  height?: number
}

const STROKE: Record<string, string> = {
  terracotta: 'stroke-terracotta-500',
  emerald: 'stroke-emerald-500',
  rose: 'stroke-rose-500',
  violet: 'stroke-violet-500',
}
const FILL: Record<string, string> = {
  terracotta: 'fill-terracotta-500',
  emerald: 'fill-emerald-500',
  rose: 'fill-rose-500',
  violet: 'fill-violet-500',
}

const W = 100

export default function Sparkline({ points, min, max, color = 'terracotta', height = 40 }: Props) {
  if (points.length === 0) {
    return <div className="text-xs text-stone-400">No data yet</div>
  }

  const span = max - min || 1
  // X spreads points evenly across the width; Y inverts (SVG y grows downward).
  const x = (i: number) => (points.length === 1 ? W / 2 : (i / (points.length - 1)) * W)
  const y = (v: number) => height - ((v - min) / span) * height

  const coords = points.map((p, i) => ({ cx: x(i), cy: y(p.value) }))
  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.cx.toFixed(2)} ${c.cy.toFixed(2)}`).join(' ')

  return (
    <svg
      viewBox={`0 0 ${W} ${height}`}
      preserveAspectRatio="none"
      className="w-full"
      style={{ height }}
      role="img"
    >
      {points.length > 1 && (
        <path d={path} fill="none" className={STROKE[color]} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      )}
      {coords.map((c, i) => (
        <circle
          key={i}
          cx={c.cx}
          cy={c.cy}
          r={i === coords.length - 1 ? 2.5 : 1.5}
          className={FILL[color]}
          vectorEffect="non-scaling-stroke"
        />
      ))}
    </svg>
  )
}

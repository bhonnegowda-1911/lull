// The Lull logomark: a rounded tile with two gentle, settling waves — calm water / a quieting
// sound. Pure inline SVG (no asset pipeline), themed on the app's terracotta ramp so it sits with
// the warm-paper aesthetic. `title`/`size` make it reusable for the header, favicons, etc.

export default function Logo({ size = 36, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 36 36"
      fill="none"
      role="img"
      aria-label="Lull"
      className={className}
    >
      <defs>
        <linearGradient id="lull-mark" x1="0" y1="0" x2="36" y2="36" gradientUnits="userSpaceOnUse">
          <stop stopColor="#d88157" />
          <stop offset="1" stopColor="#b5552f" />
        </linearGradient>
      </defs>
      <rect width="36" height="36" rx="10" fill="url(#lull-mark)" />
      {/* Two soft, parallel waves settling toward calm. */}
      <path
        d="M7 15 q3 -4.5 6 0 t6 0 t6 0"
        stroke="#fcf5f0"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.95"
      />
      <path
        d="M7 22 q3 -4.5 6 0 t6 0 t6 0"
        stroke="#fcf5f0"
        strokeWidth="2.1"
        strokeLinecap="round"
        opacity="0.6"
      />
    </svg>
  )
}

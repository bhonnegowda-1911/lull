// Shown in Interview mode. The app can simulate a lot (cold question, no tips, one take),
// but the biggest realism gains are in how you practice — so make those explicit.
const ITEMS = [
  'Camera on, sit and dress as you would for the real thing.',
  'No notes, no script. Answer cold — first take only, don’t re-record.',
  'Speak to the camera as if it’s the interviewer; say “I”, not “we”.',
  'Give yourself ~15s to think, then talk for ~2 minutes. Don’t restart.',
  'Practice when you’re a little nervous (before coffee, end of day) — that’s the real state.',
  'Afterwards, watch the replay before reading feedback. Notice the filler and the slow build-up yourself.',
]

export default function RealismChecklist() {
  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-amber-900">Make it feel real</h3>
      <ul className="mt-2 space-y-1.5 text-sm text-amber-900/90">
        {ITEMS.map((item, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-amber-500">→</span>
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

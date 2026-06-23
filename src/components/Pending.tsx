// A visible in-progress banner for LLM-backed actions. The button label alone isn't enough feedback
// for calls that can run 20–40s (longer when the model is busy and the gateway retries). Shows a
// spinner, what's happening, and sets the time expectation so the wait doesn't feel like a hang.
export default function Pending({ label }: { label: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="mt-3 flex items-center gap-3 rounded-lg border border-stone-200 bg-white p-3 text-sm text-stone-600"
    >
      <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-stone-200 border-t-terracotta-600" />
      <span>
        {label} <span className="text-stone-400">— usually 20–40s; it retries automatically if the model is busy.</span>
      </span>
    </div>
  )
}

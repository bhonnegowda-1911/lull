import { coveredThemeCount, type ThemeCoverage } from '../../lib/stories/coverage'

// The theme coverage map: all 10 competency themes as a grid, showing how many confirmed stories +
// projects cover each, with uncovered themes flagged as gaps and a shortcut to build one. Turns
// "have I covered everything?" from guesswork into a checklist.

export default function CoverageMap({
  coverage,
  onBuild,
}: {
  coverage: ThemeCoverage[]
  /** Start the coach seeded toward this theme. */
  onBuild: (theme: string) => void
}) {
  const covered = coveredThemeCount(coverage)
  const total = coverage.length

  return (
    <section className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-stone-800">Theme coverage</h3>
        <span className="text-xs text-stone-500">
          <span className={covered === total ? 'font-semibold text-emerald-600' : 'font-semibold text-stone-700'}>{covered}</span>
          {' '}of {total} themes covered
        </span>
      </div>
      <p className="mt-0.5 text-xs text-stone-500">
        Confirmed stories + project facets per competency. Gaps are themes an interviewer could ask about with no ground truth to draw on.
      </p>

      <ul className="mt-3 divide-y divide-stone-100">
        {coverage.map((c) => {
          const gap = c.total === 0
          return (
            <li key={c.theme} className="flex items-center justify-between gap-3 py-1.5">
              <div className="flex min-w-0 items-center gap-2">
                <span className={`truncate text-sm ${gap ? 'text-stone-400' : 'text-stone-700'}`}>{c.theme}</span>
                {gap && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">gap</span>
                )}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {gap ? (
                  <button
                    type="button"
                    onClick={() => onBuild(c.theme)}
                    className="rounded px-2 py-0.5 text-xs font-medium text-terracotta-600 hover:bg-terracotta-50"
                  >
                    Build
                  </button>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs text-stone-500" title={`${c.storyCount} stories, ${c.projectCount} projects`}>
                    <Dots filled={c.total} />
                    <span className="tabular-nums">{c.total}</span>
                  </span>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

// Up to 3 dots as a quick density cue (4+ shows three filled).
function Dots({ filled }: { filled: number }) {
  const n = Math.min(filled, 3)
  return (
    <span className="inline-flex items-center gap-0.5">
      {[0, 1, 2].map((i) => (
        <span key={i} className={`h-1.5 w-1.5 rounded-full ${i < n ? 'bg-emerald-500' : 'bg-stone-200'}`} />
      ))}
    </span>
  )
}

import type {
  DeliveryHabits as DeliveryHabitsData,
  DetailTendency,
  Feedback,
  FeedbackBeat,
  JobFit as JobFitData,
  LevelSignal as LevelSignalData,
  Severity,
  StoryFidelity as StoryFidelityData,
} from '../types'

const SEVERITY_STYLE: Record<Severity, string> = {
  high: 'border-red-200 bg-red-50',
  medium: 'border-amber-200 bg-amber-50',
  low: 'border-stone-200 bg-stone-50',
}

const SEVERITY_DOT: Record<Severity, string> = {
  high: 'bg-red-500',
  medium: 'bg-amber-500',
  low: 'bg-stone-400',
}

function ScoreBadge({ label, value }: { label: string; value?: number | null }) {
  if (value == null) return null
  const color =
    value >= 4 ? 'text-green-700 bg-green-100' : value >= 3 ? 'text-amber-700 bg-amber-100' : 'text-red-700 bg-red-100'
  return (
    <div className="flex flex-col items-center">
      <span className={`rounded-full px-3 py-1 text-sm font-semibold ${color}`}>{value}/5</span>
      <span className="mt-1 text-xs capitalize text-stone-500">{label}</span>
    </div>
  )
}

function BeatRow({ beat }: { beat: FeedbackBeat }) {
  return (
    <div className="flex items-start gap-3 py-2">
      <span
        className={`mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${
          beat.present ? 'bg-green-500' : 'bg-stone-300'
        }`}
        title={beat.present ? 'Present' : 'Missing'}
      >
        {beat.label?.[0]}
      </span>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-stone-800">{beat.label}</span>
          {beat.score != null && <span className="text-xs text-stone-400">{beat.score}/5</span>}
        </div>
        {beat.note && <p className="text-sm text-stone-600">{beat.note}</p>}
      </div>
    </div>
  )
}

const LEVEL_ORDER = ['junior', 'mid', 'senior', 'staff', 'principal']
const LEVEL_LABEL: Record<string, string> = {
  junior: 'Junior',
  mid: 'Mid',
  senior: 'Senior',
  staff: 'Staff',
  principal: 'Principal',
}

function LevelSignal({ level }: { level: LevelSignalData | null }) {
  if (!level?.level) return null
  const idx = LEVEL_ORDER.indexOf(level.level)
  return (
    <div className="rounded-xl border border-terracotta-200 bg-terracotta-50 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-terracotta-900">Level signal</h3>
        <span className="rounded-full bg-terracotta-600 px-3 py-0.5 text-sm font-semibold text-white">
          {LEVEL_LABEL[level.level] || level.level}
        </span>
      </div>

      {/* Ladder: highlight the signalled level so it reads at a glance. */}
      <div className="mt-3 flex gap-1">
        {LEVEL_ORDER.map((l, i) => (
          <div key={l} className="flex-1 text-center">
            <div className={`h-1.5 rounded-full ${i <= idx ? 'bg-terracotta-500' : 'bg-terracotta-200'}`} />
            <div className={`mt-1 text-[10px] ${i === idx ? 'font-semibold text-terracotta-800' : 'text-terracotta-400'}`}>
              {LEVEL_LABEL[l]}
            </div>
          </div>
        ))}
      </div>

      {level.rationale && <p className="mt-3 text-sm text-terracotta-900/90">{level.rationale}</p>}
      {Array.isArray(level.signals) && level.signals.length > 0 && (
        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-sm text-terracotta-900/80">
          {level.signals.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}

      {Array.isArray(level.toReachHigher) && level.toReachHigher.length > 0 && (
        <div className="mt-4 border-t border-terracotta-200 pt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-terracotta-700">
            How to push this story higher
          </div>
          <div className="mt-2 space-y-3">
            {level.toReachHigher.map((t, i) => (
              <div key={i}>
                <div className="flex items-center gap-2">
                  <span className="rounded bg-terracotta-600 px-1.5 py-0.5 text-[11px] font-semibold text-white">
                    {LEVEL_LABEL[t.level] || t.level}
                  </span>
                  <span className="text-xs text-terracotta-700">to read at this level:</span>
                </div>
                <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-terracotta-900/85">
                  {(t.guidance || []).map((g, j) => (
                    <li key={j}>{g}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="mt-3 text-xs text-terracotta-500">
        The level this answer demonstrates — scope, ownership, and influence — not a verdict on you.
      </p>
    </div>
  )
}

const TENDENCY_LABEL: Record<DetailTendency, string> = {
  too_much: 'Too much detail',
  balanced: 'Right altitude',
  too_little: 'Too vague',
}

interface HabitRowProps {
  label: string
  score?: number | null
  status?: string
  statusLabel?: string
  note?: string
}

function HabitRow({ label, score, status, statusLabel, note }: HabitRowProps) {
  const good = score != null ? score >= 4 : status === 'good'
  const ok = score != null ? score === 3 : status === 'ok'
  const dot = good ? 'bg-green-500' : ok ? 'bg-amber-500' : 'bg-red-500'
  return (
    <div className="py-2">
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${dot}`} />
        <span className="text-sm font-medium text-stone-800">{label}</span>
        {statusLabel && <span className="text-xs text-stone-400">{statusLabel}</span>}
        {score != null && <span className="ml-auto text-xs text-stone-400">{score}/5</span>}
      </div>
      {note && <p className="mt-0.5 pl-[18px] text-sm text-stone-600">{note}</p>}
    </div>
  )
}

function DeliveryHabits({ habits }: { habits: DeliveryHabitsData | null }) {
  if (!habits) return null
  const lead = habits.leadsWithOutcome
  const detail = habits.detailAltitude
  return (
    <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
      <h3 className="text-sm font-semibold text-stone-700">Delivery habits</h3>
      <p className="mt-0.5 text-xs text-stone-400">The two highest-leverage things to fix.</p>
      <div className="mt-2 divide-y divide-stone-100">
        {lead && (
          <HabitRow
            label="Led with the outcome"
            score={lead.score}
            statusLabel={lead.present ? 'stated up front' : 'buried the result'}
            note={lead.note}
          />
        )}
        {detail && (
          <HabitRow
            label="Detail altitude"
            score={detail.score}
            statusLabel={TENDENCY_LABEL[detail.tendency] || detail.tendency}
            note={detail.note}
          />
        )}
      </div>
    </div>
  )
}

function StoryFidelity({ fidelity }: { fidelity: StoryFidelityData | null }) {
  if (!fidelity) return null
  const groups: Array<{ label: string; items: string[] }> = [
    { label: 'You undersold', items: fidelity.underSold || [] },
    { label: 'Impact you left out', items: fidelity.omittedImpact || [] },
    { label: 'Said “we” for your own work', items: fidelity.misattributedToTeam || [] },
  ].filter((g) => g.items.length > 0)

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-violet-900">Content coaching</h3>
        {fidelity.matchedStoryTitle && (
          <span className="rounded-full bg-violet-600 px-3 py-0.5 text-xs font-semibold text-white">
            {fidelity.matchedStoryTitle}
          </span>
        )}
      </div>
      <p className="mt-0.5 text-xs text-violet-500">How your telling compared to your real story.</p>
      {fidelity.note && <p className="mt-3 text-sm text-violet-900/90">{fidelity.note}</p>}

      {groups.map((g) => (
        <div key={g.label} className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-violet-700">{g.label}</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-violet-900/85">
            {g.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </div>
      ))}

      {fidelity.betterExampleTitle && (
        <div className="mt-4 border-t border-violet-200 pt-3 text-sm text-violet-900/90">
          <span className="font-semibold">Stronger example for this question: </span>
          {fidelity.betterExampleTitle}
        </div>
      )}
    </div>
  )
}

function JobFit({ fit }: { fit: JobFitData | null }) {
  if (!fit) return null
  const groups: Array<{ label: string; items: string[] }> = [
    { label: 'Evidenced for this role', items: fit.mustHavesHit || [] },
    { label: 'Missing for this role', items: fit.mustHavesMissed || [] },
    { label: 'Company values you signaled', items: fit.valuesSignaled || [] },
  ].filter((g) => g.items.length > 0)

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-sky-900">Fit for {fit.company || 'this role'}</h3>
        <span className="rounded-full bg-sky-600 px-3 py-0.5 text-xs font-semibold text-white">{fit.score}/5 fit</span>
      </div>
      <p className="mt-0.5 text-xs text-sky-500">How this answer lands for the target company and JD.</p>
      {fit.note && <p className="mt-3 text-sm text-sky-900/90">{fit.note}</p>}

      {groups.map((g) => (
        <div key={g.label} className="mt-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-sky-700">{g.label}</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-sky-900/85">
            {g.items.map((it, i) => (
              <li key={i}>{it}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

export default function FeedbackPanel({ feedback }: { feedback: Feedback | null }) {
  if (!feedback) return null
  const { conforms, summary, scores, level, habits, beats, filler, notes, storyFidelity, jobFit } = feedback

  return (
    <div className="space-y-5">
      <LevelSignal level={level} />
      <JobFit fit={jobFit} />
      <StoryFidelity fidelity={storyFidelity} />
      <DeliveryHabits habits={habits} />
      <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-stone-700">STAR analysis</h3>
          <span
            className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${
              conforms ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
            }`}
          >
            {conforms ? 'Follows STAR' : 'Loosely structured'}
          </span>
        </div>
        {summary && <p className="mt-3 text-sm leading-relaxed text-stone-700">{summary}</p>}

        {(scores.clarity != null || scores.structure != null || scores.impact != null) && (
          <div className="mt-4 flex justify-around border-t border-stone-100 pt-4">
            <ScoreBadge label="clarity" value={scores.clarity} />
            <ScoreBadge label="structure" value={scores.structure} />
            <ScoreBadge label="impact" value={scores.impact} />
          </div>
        )}

        {beats.length > 0 && (
          <div className="mt-4 divide-y divide-stone-100 border-t border-stone-100 pt-2">
            {beats.map((b) => (
              <BeatRow key={b.key} beat={b} />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
        <div className="flex items-baseline justify-between">
          <h3 className="text-sm font-semibold text-stone-700">Filler words</h3>
          <span className="text-sm text-stone-500">
            {filler.total} total
            {filler.perMinute != null && ` · ${filler.perMinute.toFixed(1)}/min`}
          </span>
        </div>
        {Object.keys(filler.byWord).length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {Object.entries(filler.byWord)
              .sort((a, b) => b[1] - a[1])
              .map(([word, count]) => (
                <span
                  key={word}
                  className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-600"
                >
                  {word} ×{count}
                </span>
              ))}
          </div>
        )}
      </div>

      {notes.length > 0 && (
        <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-stone-700">Coaching notes</h3>
          <ul className="mt-3 space-y-2">
            {notes.map((n, i) => (
              <li key={i} className={`rounded-lg border p-3 ${SEVERITY_STYLE[n.severity] || SEVERITY_STYLE.low}`}>
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full ${SEVERITY_DOT[n.severity] || SEVERITY_DOT.low}`} />
                  <span className="text-sm font-medium text-stone-800">{n.title}</span>
                  <span className="text-xs uppercase tracking-wide text-stone-400">{n.severity}</span>
                </div>
                <p className="mt-1 text-sm text-stone-600">{n.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

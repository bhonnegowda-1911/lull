import { motion } from 'framer-motion'
import { CheckCircle2, AlertTriangle, TrendingUp, ListChecks, Play } from 'lucide-react'
import type { HireSignal, InterviewReview, RoundType, Score } from '../../types'
import { stagger, staggerItem } from '../../lib/ui/motion'

// Read-only render of a graded interview (see InterviewReview). Used both right after grading and
// when reopening a saved review from history.

const ROUND_LABEL: Record<RoundType, string> = {
  recruiter: 'Recruiter screen',
  technical_screen: 'Technical screen',
  take_home: 'Take-home review',
  hiring_manager: 'Hiring manager',
  project_deep_dive: 'Project deep dive',
  system_design: 'System design',
  behavioral: 'Behavioral',
  leadership: 'Leadership round',
  refactoring: 'Refactoring exercise',
  ai_building: 'AI building exercise',
  architecture_design: 'High-level architecture design',
  working_with_product: 'Working with product',
  onsite_loop: 'Onsite loop',
  custom: 'Interview',
}

const SIGNAL_LABEL: Record<HireSignal, string> = {
  strong_yes: 'Strong hire',
  yes: 'Hire',
  lean_yes: 'Lean hire',
  lean_no: 'Lean no-hire',
  no: 'No hire',
}

const SIGNAL_CLASS: Record<HireSignal, string> = {
  strong_yes: 'bg-emerald-100 text-emerald-700',
  yes: 'bg-emerald-100 text-emerald-700',
  lean_yes: 'bg-amber-100 text-amber-700',
  lean_no: 'bg-orange-100 text-orange-700',
  no: 'bg-red-100 text-red-700',
}

function gradeClass(grade: string): string {
  if (grade === 'A' || grade === 'B') return 'text-emerald-600'
  if (grade === 'C') return 'text-amber-600'
  return 'text-red-600'
}

function scoreBar(score: Score): string {
  if (score >= 4) return 'bg-emerald-500'
  if (score === 3) return 'bg-amber-500'
  return 'bg-red-500'
}

function formatDuration(sec: number | null): string | null {
  if (!sec || sec <= 0) return null
  const m = Math.round(sec / 60)
  return `${m} min`
}

function clock(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function ReviewReport({
  review,
  durationSec,
  label,
  diarized,
  onSeek,
}: {
  review: InterviewReview
  durationSec?: number | null
  label?: string | null
  diarized?: boolean
  /** When provided, exchanges with a timestamp show a play button that seeks the recording. */
  onSeek?: (sec: number) => void
}) {
  const roundLabel = ROUND_LABEL[review.roundType] || 'Interview'
  const dur = formatDuration(durationSec ?? null)

  return (
    <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
      {/* Headline */}
      <motion.div
        variants={staggerItem}
        className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-stone-800 px-2.5 py-0.5 text-xs font-medium text-white">
                {roundLabel}
              </span>
              <span className="text-xs text-stone-400 capitalize">
                {review.roundConfidence} confidence
              </span>
              {dur && <span className="text-xs text-stone-400">· {dur}</span>}
              {diarized && (
                <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-medium text-sky-700">
                  Speaker-separated
                </span>
              )}
            </div>
            {label && <p className="mt-2 text-sm font-medium text-stone-700">{label}</p>}
            <p className="mt-2 max-w-2xl text-sm text-stone-600">{review.summary}</p>
            <p className="mt-1.5 text-xs italic text-stone-400">{review.roundRationale}</p>
          </div>
          <div className="flex shrink-0 items-center gap-4">
            <div className="text-center">
              <div className={`font-serif text-4xl font-semibold leading-none ${gradeClass(review.grade)}`}>
                {review.grade}
              </div>
              <div className="mt-1 text-xs text-stone-400">{review.overallScore}/100</div>
            </div>
            <span
              className={`rounded-lg px-3 py-1.5 text-sm font-semibold ${SIGNAL_CLASS[review.hireSignal] || 'bg-stone-100 text-stone-600'}`}
            >
              {SIGNAL_LABEL[review.hireSignal] || review.hireSignal}
            </span>
          </div>
        </div>
      </motion.div>

      {/* Dimensions */}
      {review.dimensions.length > 0 && (
        <motion.div
          variants={staggerItem}
          className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm"
        >
          <h3 className="text-sm font-semibold text-stone-700">Scorecard</h3>
          <div className="mt-3 space-y-3">
            {review.dimensions.map((d) => (
              <div key={d.key}>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-stone-700">{d.label}</span>
                  <span className="shrink-0 text-xs font-medium text-stone-500">{d.score}/5</span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
                  <div className={`h-full rounded-full ${scoreBar(d.score)}`} style={{ width: `${(d.score / 5) * 100}%` }} />
                </div>
                <p className="mt-1 text-xs text-stone-500">{d.note}</p>
              </div>
            ))}
          </div>
        </motion.div>
      )}

      {/* Strengths / improvements / red flags */}
      <motion.div variants={staggerItem} className="grid gap-4 md:grid-cols-3">
        <ListCard
          icon={<CheckCircle2 size={15} className="text-emerald-600" aria-hidden />}
          title="Strengths"
          items={review.strengths}
          empty="None noted."
        />
        <ListCard
          icon={<TrendingUp size={15} className="text-amber-600" aria-hidden />}
          title="Work on next"
          items={review.improvements}
          empty="None noted."
        />
        <ListCard
          icon={<AlertTriangle size={15} className="text-red-600" aria-hidden />}
          title="Red flags"
          items={review.redFlags}
          empty="None — clean run."
        />
      </motion.div>

      {/* Question-by-question */}
      {review.exchanges.length > 0 && (
        <motion.div
          variants={staggerItem}
          className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm"
        >
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-stone-700">
            <ListChecks size={15} aria-hidden /> Question by question
          </h3>
          <div className="mt-3 space-y-3">
            {review.exchanges.map((ex, i) => (
              <details key={i} className="group rounded-lg border border-stone-200 bg-white/50 p-3">
                <summary className="flex cursor-pointer items-center justify-between gap-3 text-sm font-medium text-stone-800 marker:content-none">
                  <span className="min-w-0">
                    <span className="text-stone-400">Q{i + 1}.</span> {ex.question}
                  </span>
                  <span className="flex shrink-0 items-center gap-1.5">
                    {onSeek && ex.atSec != null && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.preventDefault()
                          e.stopPropagation()
                          onSeek(ex.atSec as number)
                        }}
                        title="Play from here"
                        className="inline-flex items-center gap-1 rounded bg-stone-100 px-1.5 py-0.5 text-[11px] font-medium text-stone-600 hover:bg-terracotta-100 hover:text-terracotta-700"
                      >
                        <Play size={10} aria-hidden /> {clock(ex.atSec)}
                      </span>
                    )}
                    <span className={`rounded px-1.5 py-0.5 text-xs font-semibold text-white ${scoreBar(ex.score)}`}>
                      {ex.score}/5
                    </span>
                  </span>
                </summary>
                <div className="mt-3 space-y-2.5 border-t border-stone-100 pt-3 text-sm">
                  <p className="text-stone-600">
                    <span className="font-medium text-stone-500">You said: </span>
                    {ex.answerSummary}
                  </p>
                  <p className="text-stone-600">
                    <span className="font-medium text-stone-500">Assessment: </span>
                    {ex.assessment}
                  </p>
                  <p className="rounded-md bg-emerald-50/70 p-2.5 text-stone-700">
                    <span className="font-medium text-emerald-700">Stronger answer: </span>
                    {ex.betterAnswer}
                  </p>
                </div>
              </details>
            ))}
          </div>
        </motion.div>
      )}
    </motion.div>
  )
}

function ListCard({
  icon,
  title,
  items,
  empty,
}: {
  icon: React.ReactNode
  title: string
  items: string[]
  empty: string
}) {
  return (
    <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-4 shadow-sm">
      <h3 className="flex items-center gap-1.5 text-sm font-semibold text-stone-700">
        {icon} {title}
      </h3>
      {items.length === 0 ? (
        <p className="mt-2 text-xs text-stone-400">{empty}</p>
      ) : (
        <ul className="mt-2 space-y-1.5">
          {items.map((it, i) => (
            <li key={i} className="flex gap-1.5 text-xs text-stone-600">
              <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-stone-300" />
              {it}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

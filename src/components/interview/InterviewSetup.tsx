import {
  INTERVIEW_MODES,
  INTERVIEWER_STYLES,
  MODE_BLURB,
  MODE_LABEL,
  STYLE_BLURB,
  STYLE_LABEL,
  TARGET_LEVELS,
  TARGET_LEVEL_LABEL,
  type InterviewConfig,
  type InterviewerStyle,
  type InterviewMode,
  type TargetLevel,
} from '../../lib/interview/persona'

// Pre-interview dials shown on the pick screen for the coding + system-design modes. Lets the
// candidate set the BAR they're held to (target level) and how sharp the INTERVIEWER plays
// (style) — so a "staff" sim isn't always conducted by a superhuman, omniscient interviewer.
// `showMode` additionally exposes the interview-vs-coaching dial (system design only for now):
// coaching flips the round into a teaching session that reveals strong answers and explains why.

interface InterviewSetupProps {
  value: InterviewConfig
  onChange: (config: InterviewConfig) => void
  showMode?: boolean
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
  labelOf,
}: {
  options: readonly T[]
  value: T
  onChange: (v: T) => void
  labelOf: (v: T) => string
}) {
  return (
    <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5">
      {options.map((opt) => {
        const on = opt === value
        return (
          <button
            key={opt}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(opt)}
            className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
              on ? 'bg-terracotta-600 text-white' : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            {labelOf(opt)}
          </button>
        )
      })}
    </div>
  )
}

export default function InterviewSetup({ value, onChange, showMode = false }: InterviewSetupProps) {
  const coaching = value.mode === 'coaching'
  return (
    <div className="mt-4 grid gap-3 rounded-lg border border-stone-200 bg-white/60 p-3 sm:grid-cols-2">
      {showMode && (
        <div className="sm:col-span-2">
          <div className="text-xs font-medium text-stone-500">Mode</div>
          <div className="mt-1.5">
            <Segmented
              options={INTERVIEW_MODES}
              value={value.mode}
              onChange={(mode: InterviewMode) => onChange({ ...value, mode })}
              labelOf={(m) => MODE_LABEL[m]}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-stone-400">{MODE_BLURB[value.mode]}</p>
        </div>
      )}
      <div>
        <div className="text-xs font-medium text-stone-500">Target level</div>
        <div className="mt-1.5">
          <Segmented
            options={TARGET_LEVELS}
            value={value.targetLevel}
            onChange={(targetLevel: TargetLevel) => onChange({ ...value, targetLevel })}
            labelOf={(l) => TARGET_LEVEL_LABEL[l]}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-stone-400">
          {coaching ? "The bar your coach helps you reach." : "The bar you're held to and graded toward."}
        </p>
      </div>
      {/* The interviewer-sharpness dial only applies to a real interview; a coach's tone is fixed. */}
      <div className={coaching ? 'pointer-events-none opacity-40' : ''} aria-disabled={coaching}>
        <div className="text-xs font-medium text-stone-500">Interviewer</div>
        <div className="mt-1.5">
          <Segmented
            options={INTERVIEWER_STYLES}
            value={value.style}
            onChange={(style: InterviewerStyle) => onChange({ ...value, style })}
            labelOf={(s) => STYLE_LABEL[s]}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-stone-400">
          {coaching ? 'Not used in coaching mode.' : STYLE_BLURB[value.style]}
        </p>
      </div>
    </div>
  )
}

import {
  INTERVIEWER_STYLES,
  STYLE_BLURB,
  STYLE_LABEL,
  TARGET_LEVELS,
  TARGET_LEVEL_LABEL,
  type InterviewConfig,
  type InterviewerStyle,
  type TargetLevel,
} from '../../lib/interview/persona'

// Pre-interview dials shown on the pick screen for the coding + system-design modes. Lets the
// candidate set the BAR they're held to (target level) and how sharp the INTERVIEWER plays
// (style) — so a "staff" sim isn't always conducted by a superhuman, omniscient interviewer.

interface InterviewSetupProps {
  value: InterviewConfig
  onChange: (config: InterviewConfig) => void
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

export default function InterviewSetup({ value, onChange }: InterviewSetupProps) {
  return (
    <div className="mt-4 grid gap-3 rounded-lg border border-stone-200 bg-white/60 p-3 sm:grid-cols-2">
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
        <p className="mt-1.5 text-[11px] text-stone-400">The bar you're held to and graded toward.</p>
      </div>
      <div>
        <div className="text-xs font-medium text-stone-500">Interviewer</div>
        <div className="mt-1.5">
          <Segmented
            options={INTERVIEWER_STYLES}
            value={value.style}
            onChange={(style: InterviewerStyle) => onChange({ ...value, style })}
            labelOf={(s) => STYLE_LABEL[s]}
          />
        </div>
        <p className="mt-1.5 text-[11px] text-stone-400">{STYLE_BLURB[value.style]}</p>
      </div>
    </div>
  )
}

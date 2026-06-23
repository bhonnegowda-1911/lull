import { useEffect, useRef, useState } from 'react'
import MicButton from '../../components/MicButton'
import { storyTurn, type StoryBeats, type StoryMessage } from '../../lib/stories/coach'
import { STORY_THEMES, type Story } from '../../data/stories'
import type { BehavioralLevel, ParsedJob } from '../../types'

// Conversational story builder UI — the story-bank sibling of FacetChat. The coach interviews one
// question at a time (see lib/stories/coach.ts): a live S·T·A·R·✦ meter, a themes meter (breadth),
// and an honest level read (depth) all fill as it mines the experience. It can build a new story or
// REFINE an existing one (seeded from it, auto-assessed on open), and can be pointed at a target job
// so it probes for that JD's requirements. Only the accepted Story is lifted up for a final review.

const BEAT_LABELS = ['S', 'T', 'A', 'R', '✦'] as const // ✦ = takeaway (the point)
const CACHE_KEY = 'deliveryCoach.storyCoachDraft'
const LEVEL_ORDER: BehavioralLevel[] = ['junior', 'mid', 'senior', 'staff', 'principal']

interface CoachCache {
  draftId: string
  messages: StoryMessage[]
  beats: StoryBeats | null
  themesCovered: string[]
}

function beatsFromLive(b: StoryBeats): boolean[] {
  return [b.situation, b.task, b.action, b.result, b.takeaway].map((x) => x.present && x.score >= 3)
}

function StarMeter({ filled }: { filled: boolean[] }) {
  return (
    <span className="inline-flex items-center gap-1" title="STAR + takeaway coverage">
      {BEAT_LABELS.map((label, i) => (
        <span
          key={label}
          className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
            filled[i] ? 'bg-emerald-500 text-white' : 'bg-stone-200 text-stone-400'
          }`}
        >
          {label}
        </span>
      ))}
    </span>
  )
}

// Live themes meter — every competency theme as a chip, lit as the coach mines the experience for it.
function ThemesMeter({ covered }: { covered: string[] }) {
  const set = new Set(covered)
  return (
    <div>
      <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
        Themes captured ({set.size}/{STORY_THEMES.length})
      </p>
      <div className="flex flex-wrap gap-1">
        {STORY_THEMES.map((t) => (
          <span
            key={t}
            className={`rounded-full px-2 py-0.5 text-[11px] ${
              set.has(t) ? 'bg-emerald-100 font-medium text-emerald-700' : 'bg-stone-100 text-stone-400'
            }`}
          >
            {t}
          </span>
        ))}
      </div>
    </div>
  )
}

// The coach's honest read of the level the story currently demonstrates, vs. the target.
function LevelRead({ assessed, target }: { assessed: string; target: BehavioralLevel }) {
  if (!assessed) return null
  const a = LEVEL_ORDER.indexOf(assessed as BehavioralLevel)
  const t = LEVEL_ORDER.indexOf(target)
  const cls =
    a < 0 ? 'bg-stone-100 text-stone-500' : a >= t ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
  return (
    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium capitalize ${cls}`} title={`Target: ${target}`}>
      Reads as: {assessed}
    </span>
  )
}

const SEED = "Let's build one story. Pick a project or moment you're proud of — what was going on, and what were you specifically brought in to do?"

/** Opening question, optionally framed toward a theme the user is trying to cover. */
function seedFor(theme?: string): string {
  if (!theme) return SEED
  return `Let's build a story that shows ${theme}. Tell me about a time that called for it — what was the situation, and what were you specifically brought in to do?`
}

/** Flatten an existing story into a candidate-style recap to seed a refine session. */
function storyToSeedText(s: Story): string {
  const L = [`Title: ${s.title || '(untitled)'}`]
  if (s.star.situation) L.push(`Situation: ${s.star.situation}`)
  if (s.star.task) L.push(`Task: ${s.star.task}`)
  if (s.star.actions?.length) L.push(`Actions: ${s.star.actions.join('; ')}`)
  if (s.star.result) L.push(`Result: ${s.star.result}`)
  if (s.star.takeaway) L.push(`Takeaway: ${s.star.takeaway}`)
  if (s.impact.metrics?.length) L.push(`Metrics: ${s.impact.metrics.join('; ')}`)
  return L.join('\n')
}

export default function StoryCoach({
  targetLevel,
  seedTheme,
  job,
  initialStory,
  onAccept,
  onCancel,
}: {
  targetLevel: BehavioralLevel
  /** When set (new build), the coach opens framed toward this theme (from the coverage map's "Build"). */
  seedTheme?: string
  /** A target job to mine the story toward — its must-haves/keywords get probed. */
  job?: ParsedJob | null
  /** When set, refine THIS story: seed from it, auto-assess on open, keep its id/status on accept. */
  initialStory?: Story | null
  onAccept: (story: Story) => void
  onCancel: () => void
}) {
  const isRefine = Boolean(initialStory)
  // Refine sessions never touch the new-build cache (different story); new builds restore from it.
  const cached = useRef<CoachCache | null>(isRefine ? null : loadCache())
  const [draftId] = useState(() => initialStory?.id ?? cached.current?.draftId ?? crypto.randomUUID())
  const [messages, setMessages] = useState<StoryMessage[]>(() => {
    if (isRefine && initialStory) {
      return [
        {
          role: 'coach',
          text: `Let's strengthen this story for a ${targetLevel} bar${job ? ` and the ${job.title} role` : ''}. Here's what you have — I'll probe for what's missing.`,
        },
        { role: 'you', text: storyToSeedText(initialStory) },
      ]
    }
    return cached.current?.messages ?? [{ role: 'coach', text: seedFor(seedTheme) }]
  })
  const [beats, setBeats] = useState<StoryBeats | null>(() => cached.current?.beats ?? null)
  const [themesCovered, setThemesCovered] = useState<string[]>(() => cached.current?.themesCovered ?? [])
  const [assessedLevel, setAssessedLevel] = useState('')
  const [jobGaps, setJobGaps] = useState<string[]>([])
  const [draft, setDraft] = useState<Story | null>(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [micBusy, setMicBusy] = useState(false)

  // Persist new-build conversations so a reload doesn't lose a long, voice-built story.
  useEffect(() => {
    if (!isRefine) saveCache({ draftId, messages, beats, themesCovered })
  }, [isRefine, draftId, messages, beats, themesCovered])

  // Shared turn runner — used by send() and the refine auto-assessment.
  async function runTurn(conversation: StoryMessage[]) {
    setDraft(null)
    setLoading(true)
    setError(null)
    try {
      const result = await storyTurn({ conversation, targetLevel, job, draftId })
      setBeats(result.beats)
      setThemesCovered(result.themesCovered)
      setAssessedLevel(result.assessedLevel)
      setJobGaps(result.jobEvidenceGaps)
      if (result.status === 'ready' && result.draft) {
        setDraft(result.draft)
      } else if (result.next) {
        setMessages((m) => [...m, { role: 'coach', text: result.next }])
      }
    } catch (e) {
      // Surface the real cause (no key / auth / network / parse) rather than a generic guess.
      setError(e instanceof Error ? e.message : 'Could not reach the coach — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  // On opening a refine, immediately assess the existing story so gaps (incl. JD gaps) show up front.
  const didInit = useRef(false)
  useEffect(() => {
    if (isRefine && !didInit.current) {
      didInit.current = true
      void runTurn(messages)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    const next = [...messages, { role: 'you' as const, text }]
    setMessages(next)
    setInput('')
    await runTurn(next)
  }

  function accept() {
    if (!draft) return
    if (!isRefine) clearCache()
    // On refine, keep the original story's lifecycle fields; the coach only reshapes its content.
    onAccept(
      isRefine && initialStory
        ? { ...draft, status: initialStory.status, projectId: initialStory.projectId, sourceSessionIds: initialStory.sourceSessionIds }
        : draft,
    )
  }

  function discard() {
    if (!isRefine) clearCache()
    onCancel()
  }

  const inputCls = 'w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-terracotta-500 focus:outline-none'

  return (
    <div className="space-y-3 rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-stone-900">{isRefine ? 'Refine story with the coach' : 'Build a story with the coach'}</h2>
          <p className="text-xs text-stone-500">
            One question at a time, toward a <span className="font-medium capitalize">{targetLevel}</span> bar
            {job ? <> for <span className="font-medium">{job.title}</span></> : null}. Accept when it’s ready to review.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <LevelRead assessed={assessedLevel} target={targetLevel} />
          <StarMeter filled={beats ? beatsFromLive(beats) : [false, false, false, false, false]} />
        </div>
      </div>

      <ThemesMeter covered={themesCovered} />

      {job && jobGaps.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
          <span className="font-semibold">Still to mine for {job.title}:</span> {jobGaps.join(' · ')}
        </div>
      )}

      <div className="space-y-2 rounded-md border border-stone-200 bg-stone-50 p-3">
        <div className="space-y-2">
          {messages.map((m, i) => (
            <div key={i} className={m.role === 'coach' ? '' : 'flex justify-end'}>
              <span
                className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-1.5 text-sm ${
                  m.role === 'coach' ? 'bg-white text-stone-700 ring-1 ring-stone-200' : 'bg-terracotta-600 text-white'
                }`}
              >
                {m.text}
              </span>
            </div>
          ))}
          {loading && <p className="text-xs text-stone-400">Coach is thinking…</p>}
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        {draft ? (
          <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Proposed story</p>
            <p className="text-sm font-medium text-stone-800">{draft.title || 'Untitled'}</p>
            {draft.star.takeaway && <p className="text-sm italic text-stone-600">“{draft.star.takeaway}”</p>}
            <div className="flex flex-wrap gap-1">
              {draft.themes.map((t) => (
                <span key={t} className="rounded-full bg-white px-2 py-0.5 text-[11px] text-stone-600 ring-1 ring-stone-200">
                  {t}
                </span>
              ))}
              {draft.trueCeilingLevel && (
                <span className="rounded-full bg-terracotta-100 px-2 py-0.5 text-[11px] font-medium capitalize text-terracotta-700">
                  {draft.trueCeilingLevel}
                </span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={accept}
                className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
              >
                Accept &amp; review →
              </button>
              <button
                type="button"
                onClick={() => setDraft(null)}
                className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-white"
              >
                Keep refining
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <MicButton
              disabled={loading}
              onBusyChange={setMicBusy}
              onError={setError}
              onTranscript={(t) => setInput((prev) => (prev ? `${prev} ${t}` : t))}
            />
            <input
              className={inputCls}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void send()
                }
              }}
              placeholder={micBusy ? 'Listening…' : 'Answer the coach, or use the mic…'}
              disabled={loading || micBusy}
            />
            <button
              type="button"
              onClick={() => void send()}
              disabled={loading || micBusy || !input.trim()}
              className="shrink-0 rounded-md bg-terracotta-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-terracotta-500 disabled:opacity-50"
            >
              Send
            </button>
          </div>
        )}
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={discard} className="text-xs text-stone-400 hover:text-red-600">
          Discard
        </button>
      </div>
    </div>
  )
}

// ---- ephemeral localStorage cache (new builds only) ---------------------

function loadCache(): CoachCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as CoachCache
    return parsed.messages?.length ? parsed : null
  } catch {
    return null
  }
}

function saveCache(cache: CoachCache): void {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
  } catch {
    // ignore — the cache is a convenience, not the source of truth.
  }
}

function clearCache(): void {
  try {
    localStorage.removeItem(CACHE_KEY)
  } catch {
    // ignore
  }
}

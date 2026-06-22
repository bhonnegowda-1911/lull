import { useEffect, useState } from 'react'
import { facetPrompt, type FacetAnswer, type FacetDef } from '../../data/projects'
import { facetTurn, type FacetBeats, type FacetMessage } from '../../lib/projects/facetChat'
import { clearFacetDraft, loadFacetDraft, saveFacetDraft } from '../../lib/projects/facetDraftStore'
import type { BehavioralLevel } from '../../types'

// One facet, built as a STAR conversation rather than a textarea. The coach asks one question at a
// time (seeded with the static capture prompt to save a round-trip), a live S·T·A·R meter fills as
// beats get covered, and once the coach is satisfied it offers a synthesized answer to Accept. The
// conversation is ephemeral — only the accepted FacetAnswer is lifted up via onChange and persisted.

const BEAT_LABELS = ['S', 'T', 'A', 'R'] as const

/** Which of the four beats read as covered, from live coverage or a saved answer. */
function beatsFromLive(b: FacetBeats): boolean[] {
  return [b.situation, b.task, b.action, b.result].map((x) => x.present && x.score >= 3)
}
function beatsFromValue(v: FacetAnswer): boolean[] {
  return [v.situation, v.task, v.action, v.result].map((x) => x.trim().length > 0)
}

function StarMeter({ filled }: { filled: boolean[] }) {
  return (
    <span className="inline-flex items-center gap-1" title="STAR coverage">
      {BEAT_LABELS.map((label, i) => (
        <span
          key={label}
          className={`flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold ${
            filled[i] ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400'
          }`}
        >
          {label}
        </span>
      ))}
    </span>
  )
}

export default function FacetChat({
  projectId,
  facet,
  value,
  project,
  targetLevel,
  hydrated,
  onChange,
}: {
  projectId: string
  facet: FacetDef
  value: FacetAnswer
  project: { title: string; summary: string }
  targetLevel: BehavioralLevel
  /** Flips true once the parent has pulled server drafts into the cache — recheck for one then. */
  hydrated: boolean
  onChange: (value: FacetAnswer) => void
}) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState<FacetMessage[]>([])
  const [input, setInput] = useState('')
  const [beats, setBeats] = useState<FacetBeats | null>(null)
  const [draft, setDraft] = useState<FacetAnswer | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Does a saved in-progress conversation exist? Tracked so the collapsed view can offer "Resume".
  const [hasDraft, setHasDraft] = useState(() => loadFacetDraft(projectId, facet.id) !== null)

  const hasAnswer = value.text.trim().length > 0
  const collapsedFilled = beatsFromValue(value)
  const liveFilled = beats ? beatsFromLive(beats) : collapsedFilled

  // After the parent hydrates server drafts into the cache, recheck whether one now exists.
  useEffect(() => {
    if (hydrated) setHasDraft(loadFacetDraft(projectId, facet.id) !== null)
  }, [hydrated, projectId, facet.id])

  // Persist the in-progress conversation whenever it changes (only while open and non-empty) so a
  // half-built STAR answer survives a reload — to localStorage and Postgres.
  useEffect(() => {
    if (!open || messages.length === 0) return
    saveFacetDraft(projectId, facet.id, { messages, beats, draft })
    setHasDraft(true)
  }, [open, messages, beats, draft, projectId, facet.id])

  function openChat() {
    // Resume a saved draft if one exists; otherwise seed the thread with the static capture question
    // (and any prior accepted answer as the opening turn, so "Refine" continues rather than restarts).
    const saved = loadFacetDraft(projectId, facet.id)
    if (saved) {
      setMessages(saved.messages)
      setBeats(saved.beats)
      setDraft(saved.draft)
    } else {
      const seed: FacetMessage[] = [{ role: 'coach', text: facetPrompt(facet, targetLevel) }]
      if (hasAnswer) seed.push({ role: 'you', text: value.text })
      setMessages(seed)
      setBeats(null)
      setDraft(null)
    }
    setError(null)
    setInput('')
    setOpen(true)
  }

  function discard() {
    clearFacetDraft(projectId, facet.id)
    setHasDraft(false)
    setMessages([])
    setBeats(null)
    setDraft(null)
    setInput('')
    setOpen(false)
  }

  async function send() {
    const text = input.trim()
    if (!text || loading) return
    const next = [...messages, { role: 'you' as const, text }]
    setMessages(next)
    setInput('')
    setDraft(null)
    setLoading(true)
    setError(null)
    try {
      const result = await facetTurn({ project, facetId: facet.id, conversation: next, targetLevel })
      setBeats(result.beats)
      if (result.status === 'ready' && result.draft) {
        setDraft(result.draft)
      } else if (result.next) {
        setMessages((m) => [...m, { role: 'coach', text: result.next }])
      }
    } catch {
      setError('Could not reach the coach — is the backend running?')
    } finally {
      setLoading(false)
    }
  }

  function accept() {
    if (!draft) return
    onChange(draft)
    clearFacetDraft(projectId, facet.id)
    setHasDraft(false)
    setOpen(false)
  }

  const inputCls = 'w-full rounded-md border border-slate-300 px-3 py-1.5 text-sm focus:border-indigo-500 focus:outline-none'
  const labelCls = 'text-xs font-semibold uppercase tracking-wide text-slate-500'

  return (
    <div>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className={labelCls}>{facet.label}</span>
          <StarMeter filled={open ? liveFilled : collapsedFilled} />
        </div>
        {!open && (
          <div className="flex items-center gap-2">
            {hasDraft && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700">Draft saved</span>}
            <button
              type="button"
              onClick={openChat}
              className="rounded px-2 py-0.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50"
            >
              {hasDraft ? 'Resume draft' : hasAnswer ? 'Refine with coach' : 'Build with coach'}
            </button>
          </div>
        )}
      </div>

      {!open && (
        <p className={`mt-1 text-sm ${hasAnswer ? 'text-slate-600' : 'text-slate-400'}`}>
          {hasAnswer ? value.text : hasDraft ? 'Draft in progress — resume to finish.' : facet.helper}
        </p>
      )}

      {open && (
        <div className="mt-2 space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3">
          <div className="space-y-2">
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'coach' ? '' : 'flex justify-end'}>
                <span
                  className={`inline-block max-w-[85%] rounded-lg px-3 py-1.5 text-sm ${
                    m.role === 'coach' ? 'bg-white text-slate-700 ring-1 ring-slate-200' : 'bg-indigo-600 text-white'
                  }`}
                >
                  {m.text}
                </span>
              </div>
            ))}
            {loading && <p className="text-xs text-slate-400">Coach is thinking…</p>}
          </div>

          {error && <p className="text-xs text-red-600">{error}</p>}

          {draft ? (
            <div className="space-y-2 rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Suggested STAR answer</p>
              <p className="text-sm text-slate-700">{draft.text}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={accept}
                  className="rounded-md bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-500"
                >
                  Accept
                </button>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-white"
                >
                  Keep refining
                </button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
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
                placeholder="Answer the coach…"
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => void send()}
                disabled={loading || !input.trim()}
                className="shrink-0 rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
              >
                Send
              </button>
            </div>
          )}

          <div className="flex justify-between">
            <button type="button" onClick={discard} className="text-xs text-slate-400 hover:text-red-600">
              Discard draft
            </button>
            <button type="button" onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-700">
              Close (keeps draft)
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

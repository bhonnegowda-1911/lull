import { useState } from 'react'
import { motion } from 'framer-motion'
import { Sparkles, BookmarkPlus, Check, Loader2 } from 'lucide-react'
import type { StoryDraft } from '../../data/stories'
import type { Transcript } from '../../types'
import { extractStoriesFromInterview } from '../../lib/stories/extractFromInterview'
import { saveStory } from '../../lib/storyStore'
import { stagger, staggerItem } from '../../lib/ui/motion'

// "Your interview was full of real stories" — pull the candidate's narrated experiences out of a
// reviewed interview and let them save each (or all) into the story bank as drafts to confirm later.
// The drafts are the same shape as practice-captured ones, so they flow into coaching/grading.

const OWNERSHIP_LABEL: Record<string, string> = { i: 'I owned it', we: 'Team effort', mixed: 'Mixed' }

export default function ReviewStories({
  transcript,
  label,
  sessionId,
  hasAnthropic,
  onNeedKeys,
}: {
  transcript: Transcript
  label: string | null
  sessionId: string | null
  hasAnthropic: boolean
  onNeedKeys?: () => void
}) {
  const [extracting, setExtracting] = useState(false)
  const [drafts, setDrafts] = useState<StoryDraft[] | null>(null)
  const [saved, setSaved] = useState<Record<number, string>>({}) // draft index → saved story id
  const [error, setError] = useState<string | null>(null)

  async function findStories() {
    if (!hasAnthropic) {
      onNeedKeys?.()
      return
    }
    setError(null)
    setExtracting(true)
    try {
      const result = await extractStoriesFromInterview({ transcript, label })
      setDrafts(result)
    } catch (e) {
      setError((e as Error)?.message || 'Could not extract stories.')
    } finally {
      setExtracting(false)
    }
  }

  async function save(i: number) {
    const draft = drafts?.[i]
    if (!draft || saved[i]) return
    const id = crypto.randomUUID()
    const ok = await saveStory({
      id,
      status: 'draft',
      sourceSessionIds: sessionId ? [sessionId] : [],
      projectId: null,
      ...draft,
    })
    if (ok) setSaved((prev) => ({ ...prev, [i]: id }))
    else setError('Could not save to the story bank — is the backend running?')
  }

  async function saveAll() {
    if (!drafts) return
    for (let i = 0; i < drafts.length; i++) if (!saved[i]) await save(i)
  }

  const unsavedCount = drafts ? drafts.filter((_, i) => !saved[i]).length : 0

  return (
    <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-1.5 text-sm font-semibold text-stone-700">
            <Sparkles size={15} className="text-terracotta-500" aria-hidden /> Stories from this interview
          </h3>
          <p className="mt-0.5 text-xs text-stone-500">
            The experiences you described are real STAR stories — save them to your bank to reuse and coach against.
          </p>
        </div>
        {drafts && unsavedCount > 1 && (
          <button
            type="button"
            onClick={() => void saveAll()}
            className="shrink-0 rounded-md border border-terracotta-300 px-3 py-1.5 text-sm font-medium text-terracotta-700 hover:bg-terracotta-50"
          >
            Save all ({unsavedCount})
          </button>
        )}
      </div>

      {/* Initial action */}
      {drafts === null && (
        <button
          type="button"
          onClick={() => void findStories()}
          disabled={extracting}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-terracotta-600 px-4 py-2 text-sm font-medium text-white hover:bg-terracotta-500 disabled:opacity-60"
        >
          {extracting ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <Sparkles size={15} aria-hidden />}
          {extracting ? 'Reading the transcript…' : 'Find stories in this interview'}
        </button>
      )}

      {error && <p className="mt-3 text-sm text-red-600">{error}</p>}

      {/* Results */}
      {drafts !== null && drafts.length === 0 && (
        <p className="mt-4 text-sm text-stone-500">
          No STAR stories found in this interview (e.g. a coding screen or a recruiter logistics call).
        </p>
      )}

      {drafts && drafts.length > 0 && (
        <motion.ul variants={stagger} initial="hidden" animate="show" className="mt-4 space-y-3">
          {drafts.map((d, i) => {
            const isSaved = Boolean(saved[i])
            return (
              <motion.li
                key={i}
                variants={staggerItem}
                className="rounded-lg border border-stone-200 bg-white/60 p-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-stone-800">{d.title || 'Untitled story'}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
                      {d.roleRef && <span className="text-stone-600">{d.roleRef}</span>}
                      {d.trueCeilingLevel && (
                        <span className="rounded-full bg-stone-100 px-1.5 py-0.5 capitalize">{d.trueCeilingLevel}</span>
                      )}
                      <span className="rounded-full bg-stone-100 px-1.5 py-0.5">
                        {OWNERSHIP_LABEL[d.impact.ownership] || d.impact.ownership}
                      </span>
                      {d.themes.slice(0, 3).map((t) => (
                        <span key={t} className="rounded-full bg-terracotta-50 px-1.5 py-0.5 text-terracotta-700">
                          {t}
                        </span>
                      ))}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void save(i)}
                    disabled={isSaved}
                    className={`shrink-0 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      isSaved
                        ? 'bg-emerald-100 text-emerald-700'
                        : 'border border-stone-300 text-stone-700 hover:bg-stone-50'
                    }`}
                  >
                    {isSaved ? <Check size={13} aria-hidden /> : <BookmarkPlus size={13} aria-hidden />}
                    {isSaved ? 'Saved' : 'Save to bank'}
                  </button>
                </div>

                {(d.star.situation || d.star.result) && (
                  <div className="mt-2 space-y-1 border-t border-stone-100 pt-2 text-xs text-stone-600">
                    {d.star.situation && (
                      <p>
                        <span className="font-medium text-stone-500">Situation: </span>
                        {d.star.situation}
                      </p>
                    )}
                    {d.star.result && (
                      <p>
                        <span className="font-medium text-stone-500">Result: </span>
                        {d.star.result}
                      </p>
                    )}
                    {d.impact.metrics.length > 0 && (
                      <p className="text-emerald-700">{d.impact.metrics.join(' · ')}</p>
                    )}
                  </div>
                )}
              </motion.li>
            )
          })}
        </motion.ul>
      )}

      {drafts && Object.keys(saved).length > 0 && (
        <p className="mt-3 text-xs text-stone-400">
          Saved as drafts — review and confirm them in your story bank (Library).
        </p>
      )}
    </div>
  )
}

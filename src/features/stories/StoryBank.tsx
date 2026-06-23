import { useCallback, useEffect, useState } from 'react'
import { emptyStory, type Story } from '../../data/stories'
import { listStories, saveStory, deleteStory } from '../../lib/storyStore'
import { listProjects } from '../../lib/projectStore'
import { listJobs } from '../../lib/jobStore'
import { getProfile } from '../../lib/profileStore'
import { computeThemeCoverage } from '../../lib/stories/coverage'
import StoryEditor from './StoryEditor'
import StoryCoach from './StoryCoach'
import EmptyState from '../../components/EmptyState'
import CoverageMap from './CoverageMap'
import type { Project } from '../../data/projects'
import type { BehavioralLevel, JobDescription } from '../../types'

// The story bank: your curated, ground-truth work stories. Coaching mode grades the telling of a
// rep against the CONFIRMED stories here. Stories arrive two ways — auto-extracted from each rep
// (saved as drafts to review) and manual entry / resume bootstrap (Settings) — then you confirm,
// edit, or delete them.

export default function StoryBank() {
  const [stories, setStories] = useState<Story[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [jobs, setJobs] = useState<JobDescription[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Story | null>(null)
  const [coaching, setCoaching] = useState(false)
  // When the coverage map's "Build" opens the coach, frame it toward that theme.
  const [seedTheme, setSeedTheme] = useState<string | undefined>(undefined)
  // The story being refined with the coach, if any (vs. a fresh build).
  const [refining, setRefining] = useState<Story | null>(null)
  // Optional job to mine the story toward — its must-haves/keywords get probed.
  const [jobId, setJobId] = useState<string>('')
  // The level the coach builds toward — read from the profile so it matches the rest of prep.
  const [targetLevel, setTargetLevel] = useState<BehavioralLevel>('senior')

  const load = useCallback(async () => {
    setLoading(true)
    const [s, p, j] = await Promise.all([listStories(), listProjects(), listJobs()])
    setStories(s)
    setProjects(p)
    setJobs(j)
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    void getProfile().then((p) => setTargetLevel(p.targetLevel))
  }, [load])

  const selectedJob = jobs.find((j) => j.id === jobId)?.parsed ?? null

  function startCoach(theme?: string) {
    setSeedTheme(theme)
    setRefining(null)
    setCoaching(true)
  }

  function refineCoach(story: Story) {
    setSeedTheme(undefined)
    setRefining(story)
    setCoaching(true)
  }

  async function persist(story: Story) {
    await saveStory(story)
    setEditing(null)
    await load()
  }

  async function confirmStory(story: Story) {
    await saveStory({ ...story, status: 'confirmed' })
    await load()
  }

  async function remove(story: Story) {
    if (!window.confirm('Delete this story? This cannot be undone.')) return
    await deleteStory(story.id)
    setStories((prev) => prev.filter((s) => s.id !== story.id))
  }

  const drafts = stories.filter((s) => s.status === 'draft')
  const confirmed = stories.filter((s) => s.status === 'confirmed')

  if (coaching) {
    return (
      <StoryCoach
        targetLevel={targetLevel}
        seedTheme={seedTheme}
        job={selectedJob}
        initialStory={refining}
        onAccept={(story) => {
          setCoaching(false)
          setRefining(null)
          setEditing(story) // review the synthesized story in the editor before saving
        }}
        onCancel={() => {
          setCoaching(false)
          setRefining(null)
        }}
      />
    )
  }

  if (editing) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-stone-900">{editing.title ? 'Edit story' : 'New story'}</h2>
        <StoryEditor initial={editing} onSave={persist} onCancel={() => setEditing(null)} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-stone-900">Story bank</h2>
          <p className="text-xs text-stone-500">Confirmed stories power coaching-mode content feedback.</p>
        </div>
        <div className="flex items-center gap-2">
          {jobs.length > 0 && (
            <select
              value={jobId}
              onChange={(e) => setJobId(e.target.value)}
              title="Mine stories toward a target job"
              className="rounded-md border border-stone-300 px-2 py-1.5 text-sm text-stone-600 focus:border-terracotta-500 focus:outline-none"
            >
              <option value="">No target job</option>
              {jobs.filter((j) => j.parsed).map((j) => (
                <option key={j.id} value={j.id}>
                  {j.title}{j.company ? ` — ${j.company}` : ''}
                </option>
              ))}
            </select>
          )}
          <button
            type="button"
            onClick={() => startCoach()}
            className="rounded-md bg-terracotta-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-terracotta-500"
          >
            Build with coach
          </button>
          <button
            type="button"
            onClick={() => setEditing(emptyStory(crypto.randomUUID()))}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Add manually
          </button>
        </div>
      </div>

      {!loading && (
        <CoverageMap
          coverage={computeThemeCoverage(confirmed, projects)}
          onBuild={(theme) => startCoach(theme)}
        />
      )}

      {loading ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : stories.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H17a2 2 0 0 1 2 2v13H6a2 2 0 0 1-2-2Z" />
              <path d="M4 17.5A1.5 1.5 0 0 1 5.5 16H19M9 8h6" />
            </svg>
          }
          title="No stories yet"
          description="Add one manually, bootstrap from your resume in Settings, or just practice — each rep is distilled into a draft you can review here. (Needs the backend running.)"
          action={{ label: 'Add a story', onClick: () => setEditing(emptyStory(crypto.randomUUID())) }}
        />
      ) : (
        <>
          {drafts.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-amber-700">Drafts to review ({drafts.length})</h3>
              <ul className="mt-2 space-y-2">
                {drafts.map((s) => (
                  <StoryRow key={s.id} story={s} onEdit={setEditing} onRefine={refineCoach} onConfirm={confirmStory} onDelete={remove} />
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-stone-700">Confirmed ({confirmed.length})</h3>
            {confirmed.length === 0 ? (
              <p className="mt-2 text-sm text-stone-500">None yet — confirm a draft above to use it in coaching.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {confirmed.map((s) => (
                  <StoryRow key={s.id} story={s} onEdit={setEditing} onRefine={refineCoach} onDelete={remove} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function StoryRow({
  story,
  onEdit,
  onRefine,
  onConfirm,
  onDelete,
}: {
  story: Story
  onEdit: (s: Story) => void
  onRefine: (s: Story) => void
  onConfirm?: (s: Story) => void
  onDelete: (s: Story) => void
}) {
  return (
    <li className="rounded-lg border border-stone-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-stone-800">{story.title || 'Untitled'}</span>
            {story.roleRef && <span className="text-xs text-stone-400">{story.roleRef}</span>}
            {story.trueCeilingLevel && (
              <span className="rounded-full bg-terracotta-100 px-2 py-0.5 text-[11px] font-medium capitalize text-terracotta-700">
                {story.trueCeilingLevel}
              </span>
            )}
          </div>
          {story.themes.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {story.themes.map((t) => (
                <span key={t} className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">{t}</span>
              ))}
            </div>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1.5 text-xs">
          {onConfirm && (
            <button type="button" onClick={() => onConfirm(story)} className="rounded px-2 py-1 font-medium text-green-700 hover:bg-green-50">
              Confirm
            </button>
          )}
          <button type="button" onClick={() => onRefine(story)} className="rounded px-2 py-1 font-medium text-terracotta-600 hover:bg-terracotta-50">
            Refine
          </button>
          <button type="button" onClick={() => onEdit(story)} className="rounded px-2 py-1 text-stone-600 hover:bg-stone-100">
            Edit
          </button>
          <button type="button" onClick={() => onDelete(story)} className="rounded px-2 py-1 text-stone-400 hover:bg-red-50 hover:text-red-600">
            Delete
          </button>
        </div>
      </div>
    </li>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { emptyStory, type Story } from '../../data/stories'
import { listStories, saveStory, deleteStory } from '../../lib/storyStore'
import StoryEditor from './StoryEditor'

// The story bank: your curated, ground-truth work stories. Coaching mode grades the telling of a
// rep against the CONFIRMED stories here. Stories arrive two ways — auto-extracted from each rep
// (saved as drafts to review) and manual entry / resume bootstrap (Settings) — then you confirm,
// edit, or delete them.

export default function StoryBank() {
  const [stories, setStories] = useState<Story[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Story | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setStories(await listStories())
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

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

  if (editing) {
    return (
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-slate-900">{editing.title ? 'Edit story' : 'New story'}</h2>
        <StoryEditor initial={editing} onSave={persist} onCancel={() => setEditing(null)} />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900">Story bank</h2>
          <p className="text-xs text-slate-500">Confirmed stories power coaching-mode content feedback.</p>
        </div>
        <button
          type="button"
          onClick={() => setEditing(emptyStory(crypto.randomUUID()))}
          className="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"
        >
          Add story
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : stories.length === 0 ? (
        <p className="text-sm text-slate-500">
          No stories yet. Add one manually, bootstrap from your resume in Settings, or just practice —
          each rep is distilled into a draft you can review here. (Needs the backend running.)
        </p>
      ) : (
        <>
          {drafts.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-amber-700">Drafts to review ({drafts.length})</h3>
              <ul className="mt-2 space-y-2">
                {drafts.map((s) => (
                  <StoryRow key={s.id} story={s} onEdit={setEditing} onConfirm={confirmStory} onDelete={remove} />
                ))}
              </ul>
            </section>
          )}

          <section>
            <h3 className="text-sm font-semibold text-slate-700">Confirmed ({confirmed.length})</h3>
            {confirmed.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">None yet — confirm a draft above to use it in coaching.</p>
            ) : (
              <ul className="mt-2 space-y-2">
                {confirmed.map((s) => (
                  <StoryRow key={s.id} story={s} onEdit={setEditing} onDelete={remove} />
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
  onConfirm,
  onDelete,
}: {
  story: Story
  onEdit: (s: Story) => void
  onConfirm?: (s: Story) => void
  onDelete: (s: Story) => void
}) {
  return (
    <li className="rounded-lg border border-slate-200 p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-slate-800">{story.title || 'Untitled'}</span>
            {story.roleRef && <span className="text-xs text-slate-400">{story.roleRef}</span>}
            {story.trueCeilingLevel && (
              <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[11px] font-medium capitalize text-indigo-700">
                {story.trueCeilingLevel}
              </span>
            )}
          </div>
          {story.themes.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {story.themes.map((t) => (
                <span key={t} className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">{t}</span>
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
          <button type="button" onClick={() => onEdit(story)} className="rounded px-2 py-1 text-slate-600 hover:bg-slate-100">
            Edit
          </button>
          <button type="button" onClick={() => onDelete(story)} className="rounded px-2 py-1 text-slate-400 hover:bg-red-50 hover:text-red-600">
            Delete
          </button>
        </div>
      </div>
    </li>
  )
}

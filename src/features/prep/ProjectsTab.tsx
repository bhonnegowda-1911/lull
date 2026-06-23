import { useCallback, useEffect, useState } from 'react'
import { emptyProject, FACETS, facetText, type Project } from '../../data/projects'
import { listProjects, saveProject, deleteProject } from '../../lib/projectStore'
import { clearProjectDrafts } from '../../lib/projects/facetDraftStore'
import { getProfile } from '../../lib/profileStore'
import { DEFAULT_PROFILE, type Profile } from '../../data/stories'
import ProjectBuilder from './ProjectBuilder'
import EmptyState from '../../components/EmptyState'

// The Projects tab: your deep, level-aware ground truth. Each project is captured across the
// competency facets; coaching mode reads matched projects' facets to critique content. Build them
// from a resume bootstrap (Resume tab) or by hand, and flesh out facets over time.

export default function ProjectsTab() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Project | null>(null)
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE)

  const load = useCallback(async () => {
    setLoading(true)
    setProjects(await listProjects())
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
    getProfile().then(setProfile)
  }, [load])

  async function persist(project: Project) {
    await saveProject(project)
    setEditing(null)
    await load()
  }

  async function remove(project: Project) {
    if (!window.confirm('Delete this project? This cannot be undone.')) return
    await deleteProject(project.id)
    clearProjectDrafts(project.id)
    setProjects((prev) => prev.filter((p) => p.id !== project.id))
  }

  if (editing) {
    return (
      <ProjectBuilder initial={editing} targetLevel={profile.targetLevel} onSave={persist} onCancel={() => setEditing(null)} />
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-stone-500">
          Captured for a <span className="font-semibold capitalize">{profile.targetLevel}</span> bar (change it on the Resume tab).
        </p>
        <button
          type="button"
          onClick={() => setEditing(emptyProject(crypto.randomUUID()))}
          className="rounded-md bg-terracotta-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-terracotta-500"
        >
          Add project
        </button>
      </div>

      {loading ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 7a2 2 0 0 1 2-2h4l2 2h6a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
              <path d="M12 11v4M10 13h4" />
            </svg>
          }
          title="No projects yet"
          description="Bootstrap them from your resume on the Resume tab, or add one by hand. (Needs the backend running.)"
          action={{ label: 'Add a project', onClick: () => setEditing(emptyProject(crypto.randomUUID())) }}
        />
      ) : (
        <ul className="space-y-2">
          {projects.map((p) => {
            const filled = FACETS.filter((f) => facetText(p.facets[f.id]).trim().length > 0).length
            return (
              <li key={p.id} className="rounded-lg border border-stone-200 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-stone-800">{p.title || 'Untitled'}</span>
                      {p.roleRef && <span className="text-xs text-stone-400">{p.roleRef}</span>}
                      <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">
                        {filled}/{FACETS.length} facets
                      </span>
                    </div>
                    {p.summary && <p className="mt-1 line-clamp-2 text-sm text-stone-600">{p.summary}</p>}
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5 text-xs">
                    <button type="button" onClick={() => setEditing(p)} className="rounded px-2 py-1 text-stone-600 hover:bg-stone-100">
                      Edit
                    </button>
                    <button type="button" onClick={() => remove(p)} className="rounded px-2 py-1 text-stone-400 hover:bg-red-50 hover:text-red-600">
                      Delete
                    </button>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

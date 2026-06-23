import { useEffect, useState } from 'react'
import { STORY_THEMES, type BlastRadius, type Ownership, type Story } from '../../data/stories'
import { listProjects } from '../../lib/projectStore'
import type { Project } from '../../data/projects'
import type { BehavioralLevel } from '../../types'

// Structured editor for one story, used for both manual entry and reviewing an auto-extracted
// draft. Newline-separated textareas back the string-array fields (actions, metrics) so editing
// stays plain-text simple. Save returns the assembled Story to the parent (which persists it).

const LEVELS: BehavioralLevel[] = ['junior', 'mid', 'senior', 'staff', 'principal']
const OWNERSHIP: Ownership[] = ['i', 'we', 'mixed']
const BLAST: BlastRadius[] = ['self', 'team', 'org']

const linesToList = (s: string): string[] => s.split('\n').map((l) => l.trim()).filter(Boolean)
const listToLines = (l: string[]): string => (l || []).join('\n')

const inputCls = 'w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-terracotta-500 focus:outline-none'
const labelCls = 'text-xs font-semibold uppercase tracking-wide text-stone-500'

export default function StoryEditor({
  initial,
  onSave,
  onCancel,
}: {
  initial: Story
  onSave: (story: Story) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial.title)
  const [roleRef, setRoleRef] = useState(initial.roleRef ?? '')
  const [situation, setSituation] = useState(initial.star.situation)
  const [task, setTask] = useState(initial.star.task)
  const [actions, setActions] = useState(listToLines(initial.star.actions))
  const [result, setResult] = useState(initial.star.result)
  const [takeaway, setTakeaway] = useState(initial.star.takeaway ?? '')
  const [metrics, setMetrics] = useState(listToLines(initial.impact.metrics))
  const [ownership, setOwnership] = useState<Ownership>(initial.impact.ownership)
  const [blastRadius, setBlastRadius] = useState<BlastRadius>(initial.impact.blastRadius)
  const [themes, setThemes] = useState<string[]>(initial.themes)
  const [level, setLevel] = useState<BehavioralLevel | ''>(initial.trueCeilingLevel ?? '')
  const [projectId, setProjectId] = useState<string>(initial.projectId ?? '')
  const [projects, setProjects] = useState<Project[]>([])

  useEffect(() => {
    listProjects().then(setProjects)
  }, [])

  function toggleTheme(theme: string) {
    setThemes((prev) => (prev.includes(theme) ? prev.filter((t) => t !== theme) : [...prev, theme]))
  }

  function save() {
    onSave({
      ...initial,
      title: title.trim(),
      roleRef: roleRef.trim() || null,
      star: { situation, task, actions: linesToList(actions), result, takeaway: takeaway.trim() },
      impact: { metrics: linesToList(metrics), ownership, blastRadius },
      themes,
      trueCeilingLevel: level || null,
      projectId: projectId || null,
    })
  }

  return (
    <div className="space-y-4 rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
      <div>
        <label className={labelCls}>Title</label>
        <input className={`mt-1 ${inputCls}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Cut billing latency 40%" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Role / company</label>
          <input className={`mt-1 ${inputCls}`} value={roleRef} onChange={(e) => setRoleRef(e.target.value)} placeholder="e.g. Senior Eng, Acme" />
        </div>
        <div>
          <label className={labelCls}>Linked project</label>
          <select className={`mt-1 ${inputCls}`} value={projectId} onChange={(e) => setProjectId(e.target.value)}>
            <option value="">— none —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>{p.title || 'Untitled'}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Situation</label>
          <textarea className={`mt-1 ${inputCls}`} rows={2} value={situation} onChange={(e) => setSituation(e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Task</label>
          <textarea className={`mt-1 ${inputCls}`} rows={2} value={task} onChange={(e) => setTask(e.target.value)} />
        </div>
      </div>
      <div>
        <label className={labelCls}>Actions (one per line — what YOU did)</label>
        <textarea className={`mt-1 ${inputCls}`} rows={3} value={actions} onChange={(e) => setActions(e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>Result</label>
        <textarea className={`mt-1 ${inputCls}`} rows={2} value={result} onChange={(e) => setResult(e.target.value)} />
      </div>
      <div>
        <label className={labelCls}>Takeaway — the one-line “so what” / what you learned</label>
        <input
          className={`mt-1 ${inputCls}`}
          value={takeaway}
          onChange={(e) => setTakeaway(e.target.value)}
          placeholder="e.g. Designing for the failure path first is what made the cutover boring."
        />
      </div>

      <div>
        <label className={labelCls}>Metrics (one per line — real numbers)</label>
        <textarea className={`mt-1 ${inputCls}`} rows={2} value={metrics} onChange={(e) => setMetrics(e.target.value)} placeholder="e.g. p99 latency 800ms → 480ms" />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className={labelCls}>Ownership</label>
          <select className={`mt-1 ${inputCls}`} value={ownership} onChange={(e) => setOwnership(e.target.value as Ownership)}>
            {OWNERSHIP.map((o) => (
              <option key={o} value={o}>{o === 'i' ? 'I (solo)' : o === 'we' ? 'We (shared)' : 'Mixed'}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Blast radius</label>
          <select className={`mt-1 ${inputCls}`} value={blastRadius} onChange={(e) => setBlastRadius(e.target.value as BlastRadius)}>
            {BLAST.map((b) => (
              <option key={b} value={b} className="capitalize">{b}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Level the work shows</label>
          <select className={`mt-1 ${inputCls}`} value={level} onChange={(e) => setLevel(e.target.value as BehavioralLevel | '')}>
            <option value="">—</option>
            {LEVELS.map((l) => (
              <option key={l} value={l} className="capitalize">{l}</option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Themes (which questions this answers)</label>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {STORY_THEMES.map((theme) => (
            <button
              key={theme}
              type="button"
              onClick={() => toggleTheme(theme)}
              className={`rounded-full px-2.5 py-1 text-xs ${
                themes.includes(theme) ? 'bg-terracotta-600 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {theme}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 border-t border-stone-100 pt-3">
        <button type="button" onClick={onCancel} className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50">
          Cancel
        </button>
        <button
          type="button"
          onClick={save}
          disabled={!title.trim()}
          className="rounded-md bg-terracotta-600 px-4 py-2 text-sm font-medium text-white hover:bg-terracotta-500 disabled:opacity-50"
        >
          Save
        </button>
      </div>
    </div>
  )
}

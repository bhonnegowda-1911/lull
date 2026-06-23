import { useState } from 'react'
import ResumeTab from './ResumeTab'
import ProjectsTab from './ProjectsTab'
import StoryBank from '../stories/StoryBank'
import JobsTab from './JobsTab'
import MatchTab from './MatchTab'

// The Prep hub ties the ground-truth tiers together: Resume (thin, what interview mode sees) →
// Projects (rich, level-aware capture) → Stories (answer-shaped, mined from projects), plus the
// job-fit loop: Jobs (target JDs) → Match (score the resume against one). Tabs keep it one mental
// model; each tab owns its own data loading.

type Tab = 'resume' | 'projects' | 'stories' | 'jobs' | 'match'

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'resume', label: 'Resume' },
  { id: 'projects', label: 'Projects' },
  { id: 'stories', label: 'Stories' },
  { id: 'jobs', label: 'Jobs' },
  { id: 'match', label: 'Match' },
]

export default function PrepHub() {
  const [tab, setTab] = useState<Tab>('resume')
  // Keep every tab we've opened MOUNTED (just hidden when inactive) so switching tabs never discards
  // in-progress work — a running analysis keeps running and its results, drafts, and scroll survive.
  // Tabs are rendered lazily on first visit so we don't pay to load all of them up front.
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set<Tab>(['resume']))

  function go(id: Tab) {
    setTab(id)
    setVisited((v) => (v.has(id) ? v : new Set(v).add(id)))
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-stone-900">Prep</h2>
        <p className="text-xs text-stone-500">
          Build the ground truth your behavioral answers draw on: your resume, the projects behind it,
          and the stories you’ll tell.
        </p>
      </div>

      <div className="inline-flex rounded-md border border-stone-200 p-0.5 text-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => go(t.id)}
            className={`rounded px-3 py-1 ${tab === t.id ? 'bg-terracotta-600 text-white' : 'text-stone-600 hover:text-stone-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {visited.has('resume') && <div className={tab === 'resume' ? '' : 'hidden'}><ResumeTab onBootstrapped={() => go('projects')} /></div>}
      {visited.has('projects') && <div className={tab === 'projects' ? '' : 'hidden'}><ProjectsTab /></div>}
      {visited.has('stories') && <div className={tab === 'stories' ? '' : 'hidden'}><StoryBank /></div>}
      {visited.has('jobs') && <div className={tab === 'jobs' ? '' : 'hidden'}><JobsTab /></div>}
      {visited.has('match') && <div className={tab === 'match' ? '' : 'hidden'}><MatchTab /></div>}
    </div>
  )
}

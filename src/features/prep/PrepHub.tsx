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

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Prep</h2>
        <p className="text-xs text-slate-500">
          Build the ground truth your behavioral answers draw on: your resume, the projects behind it,
          and the stories you’ll tell.
        </p>
      </div>

      <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`rounded px-3 py-1 ${tab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'resume' && <ResumeTab onBootstrapped={() => setTab('projects')} />}
      {tab === 'projects' && <ProjectsTab />}
      {tab === 'stories' && <StoryBank />}
      {tab === 'jobs' && <JobsTab />}
      {tab === 'match' && <MatchTab />}
    </div>
  )
}

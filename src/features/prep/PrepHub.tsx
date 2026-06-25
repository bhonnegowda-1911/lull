import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { FileText, FolderGit2, BookOpen, Target, type LucideIcon } from 'lucide-react'
import ResumeTab from './ResumeTab'
import ProjectsTab from './ProjectsTab'
import StoryBank from '../stories/StoryBank'
import JobsTab from './JobsTab'

// The Library: the ground-truth tiers the whole app draws on — Resume (thin, what interview mode
// sees) → Projects (rich, level-aware capture) → Stories (answer-shaped, mined from projects) →
// Jobs (target JDs). Scoring a resume against a job and planning the loop now lives in the
// per-application journey (/app/:id), reached from the Pipeline home — not a tab here.

type Tab = 'resume' | 'projects' | 'stories' | 'jobs'

const TABS: Array<{ id: Tab; label: string; icon: LucideIcon }> = [
  { id: 'resume', label: 'Resume', icon: FileText },
  { id: 'projects', label: 'Projects', icon: FolderGit2 },
  { id: 'stories', label: 'Stories', icon: BookOpen },
  { id: 'jobs', label: 'Jobs', icon: Target },
]

function isTab(v: string | null): v is Tab {
  return v === 'resume' || v === 'projects' || v === 'stories' || v === 'jobs'
}

export default function PrepHub() {
  const [params] = useSearchParams()
  const initial: Tab = isTab(params.get('tab')) ? (params.get('tab') as Tab) : 'resume'
  const [tab, setTab] = useState<Tab>(initial)
  // Keep every tab we've opened MOUNTED (just hidden when inactive) so switching tabs never discards
  // in-progress work — a running analysis keeps running and its results, drafts, and scroll survive.
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set<Tab>([initial]))

  function go(id: Tab) {
    setTab(id)
    setVisited((v) => (v.has(id) ? v : new Set(v).add(id)))
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-stone-900">Library</h2>
        <p className="text-xs text-stone-500">
          The ground truth your applications draw on: your resume, the projects behind it, the stories
          you’ll tell, and the jobs you’re targeting.
        </p>
      </div>

      <div className="inline-flex rounded-md border border-stone-200 p-0.5 text-sm">
        {TABS.map((t) => {
          const Icon = t.icon
          const isActive = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => go(t.id)}
              className={`relative flex items-center gap-1.5 rounded px-3 py-1 transition-colors ${isActive ? 'text-white' : 'text-stone-600 hover:text-stone-900'}`}
            >
              {isActive && (
                <motion.span
                  layoutId="library-tab"
                  className="absolute inset-0 rounded bg-terracotta-600"
                  transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                />
              )}
              <Icon size={14} className="relative z-10" aria-hidden />
              <span className="relative z-10">{t.label}</span>
            </button>
          )
        })}
      </div>

      {visited.has('resume') && <div className={tab === 'resume' ? '' : 'hidden'}><ResumeTab onBootstrapped={() => go('projects')} /></div>}
      {visited.has('projects') && <div className={tab === 'projects' ? '' : 'hidden'}><ProjectsTab /></div>}
      {visited.has('stories') && <div className={tab === 'stories' ? '' : 'hidden'}><StoryBank /></div>}
      {visited.has('jobs') && <div className={tab === 'jobs' ? '' : 'hidden'}><JobsTab /></div>}
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft } from 'lucide-react'
import { stagger, staggerItem } from '../../lib/ui/motion'
import { getJob, saveJob } from '../../lib/jobStore'
import { getProfile } from '../../lib/profileStore'
import { activeRounds, activeSession, emptyApplication, sessionsOf } from '../../lib/application/schedule'
import FitStep from './journey/FitStep'
import ResumeStep from './journey/ResumeStep'
import LoopStep from './journey/LoopStep'
import RoundPrep from './journey/RoundPrep'
import type { Profile } from '../../data/stories'
import type { Application, CustomRoundPrep, JobDescription, ResumeFit } from '../../types'

// The per-application journey (route /app/:jobId): one company, top to bottom — am I a fit? → tailor
// a resume & apply → build the interview loop → phased prep for the active round. Owns the job state
// and threads every mutation back through saveJob. Replaces the old MatchTab mega-scroll.

function Section({ children }: { children: React.ReactNode }) {
  return (
    <motion.section variants={staggerItem} className="rounded-2xl border border-stone-200/70 bg-white/70 p-5 shadow-sm">
      {children}
    </motion.section>
  )
}

export default function ApplicationJourney() {
  const { jobId = '' } = useParams()
  const [job, setJob] = useState<JobDescription | null>(null)
  const [profile, setProfile] = useState<Profile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    void (async () => {
      setLoading(true)
      const [j, p] = await Promise.all([getJob(jobId), getProfile()])
      setJob(j)
      setProfile(p)
      setLoading(false)
    })()
  }, [jobId])

  // The application, materialized on first need (an untracked job starts from the default loop).
  const app: Application = job?.application ?? emptyApplication()

  async function persist(nextJob: JobDescription) {
    setJob(nextJob)
    await saveJob(nextJob)
  }

  function updateApp(next: Application) {
    if (!job) return
    void persist({ ...job, application: next })
  }

  async function refresh() {
    const j = await getJob(jobId)
    if (j) setJob(j)
  }

  // Save an authored brief onto one round instance (custom / take-home rounds carry their own prep,
  // unlike the catalog selectors which save picks onto the job).
  async function saveCustomPrep(roundId: string, prep: CustomRoundPrep) {
    if (!job) return
    const rounds = app.rounds.map((r) => (r.id === roundId ? { ...r, customPrep: prep } : r))
    await persist({ ...job, application: { ...app, rounds } })
  }

  function onFit(fit: ResumeFit, signature: string) {
    updateApp({ ...app, fit: { score: fit.fitScore, verdict: fit.verdict, at: new Date().toISOString(), result: fit, signature } })
  }

  if (loading) return <p className="text-sm text-stone-500">Loading…</p>
  if (!job) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-stone-500">This application doesn't exist.</p>
        <Link to="/" className="text-sm font-medium text-terracotta-600 hover:text-terracotta-500">← Back to pipeline</Link>
      </div>
    )
  }

  const sessions = sessionsOf(app)
  const session = activeSession(app)
  const sessionRounds = activeRounds(app)
  const activeIdx = session ? sessions.findIndex((s) => s.id === session.id) : -1
  const nextSession = activeIdx >= 0 ? sessions[activeIdx + 1] ?? null : null
  const fitUnlocked = !!app.fit && app.fit.verdict !== 'mismatch'

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <Link to="/" className="inline-flex items-center gap-1 text-xs font-medium text-terracotta-600 transition-colors hover:text-terracotta-500">
            <ArrowLeft size={13} aria-hidden /> Pipeline
          </Link>
          <h2 className="mt-1 font-serif text-2xl font-semibold tracking-tight text-stone-900">
            {job.title || 'Untitled role'}
          </h2>
          {job.company && <p className="text-sm text-stone-500">{job.company}</p>}
        </div>
      </div>

      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-5">
        <Section><FitStep job={job} resumeText={profile?.resumeText ?? ''} savedFit={app.fit} onFit={onFit} /></Section>
        <Section>
          <ResumeStep
            job={job}
            profile={profile}
            baselineFitScore={app.fit?.score ?? null}
            unlocked={fitUnlocked}
            applied={app.status !== 'not_applied'}
            onApplied={() => updateApp({ ...app, status: app.status === 'not_applied' ? 'applied' : app.status })}
          />
        </Section>
        <Section><LoopStep jobId={job.id} app={app} onChange={updateApp} /></Section>
        <Section><RoundPrep job={job} rounds={sessionRounds} nextSession={nextSession} onRefreshJob={refresh} onSaveCustomPrep={saveCustomPrep} /></Section>
      </motion.div>
    </div>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { listStories } from '../../../lib/storyStore'
import { analyzeResumeFit, fitInputSignature } from '../../../lib/resume/fit'
import Pending from '../../../components/Pending'
import type { Story } from '../../../data/stories'
import type { Application, JobDescription, ResumeFit } from '../../../types'

// Step 1 of the application journey: score the current resume (+ stories) against this job. Fit is a
// score + structured gaps, never a binary. The full result is lifted to the parent (onFit) so it's
// cached on the application: the breakdown re-renders on return without another LLM call, and a
// signature of the inputs lets us flag it stale when the resume/JD/stories changed. From MatchTab.

const VERDICT_STYLE: Record<ResumeFit['verdict'], string> = {
  strong: 'bg-emerald-100 text-emerald-700',
  plausible: 'bg-terracotta-100 text-terracotta-700',
  stretch: 'bg-amber-100 text-amber-700',
  mismatch: 'bg-red-100 text-red-700',
}
const STATUS_STYLE: Record<string, string> = {
  covered: 'text-emerald-600',
  partial: 'text-amber-600',
  missing: 'text-red-600',
}
const FIX_LABEL: Record<string, string> = {
  reword: 'Reword resume',
  add_story: 'Add a story',
  genuine_gap: 'Real gap',
}

interface Props {
  job: JobDescription
  resumeText: string
  savedFit: Application['fit']
  onFit: (fit: ResumeFit, signature: string) => void
}

export default function FitStep({ job, resumeText, savedFit, onFit }: Props) {
  const [analyzing, setAnalyzing] = useState(false)
  // Seed the view from the cached run so the breakdown shows immediately, no LLM call on return.
  const [fit, setFit] = useState<ResumeFit | null>(savedFit?.result ?? null)
  const [error, setError] = useState<string | null>(null)
  // Stories feed the grader (and the signature), so load them up front to detect a stale cache.
  const [stories, setStories] = useState<Story[]>([])

  const noResume = resumeText.trim().length === 0

  useEffect(() => {
    void listStories().then(setStories)
  }, [])

  // Fingerprint of the current inputs; a cached run whose signature differs is stale (re-check).
  const currentSignature = useMemo(
    () => (job.parsed ? fitInputSignature({ resumeText, job: job.parsed, stories }) : null),
    [resumeText, job.parsed, stories],
  )
  const stale = !!savedFit?.signature && !!currentSignature && savedFit.signature !== currentSignature

  async function analyze() {
    if (!job.parsed || analyzing) return
    // Reuse the cached run when nothing that feeds it changed — the whole point of caching.
    if (savedFit?.result && savedFit.signature && savedFit.signature === currentSignature) {
      setFit(savedFit.result)
      return
    }
    setAnalyzing(true)
    setError(null)
    setFit(null)
    try {
      const freshStories = await listStories()
      setStories(freshStories)
      const result = await analyzeResumeFit({ resumeText, job: job.parsed, stories: freshStories })
      setFit(result)
      onFit(result, fitInputSignature({ resumeText, job: job.parsed, stories: freshStories }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not analyze fit — is the backend running and an LLM key set?')
    } finally {
      setAnalyzing(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-stone-900">1 · Am I a fit?</h3>
          <p className="text-xs text-stone-500">Score your resume + stories against this role before you spend effort applying.</p>
        </div>
        <button
          type="button"
          onClick={() => void analyze()}
          disabled={analyzing || !job.parsed || noResume}
          className="rounded-md bg-terracotta-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-terracotta-500 disabled:opacity-50"
        >
          {analyzing ? 'Analyzing…' : savedFit || fit ? 'Re-check fit' : 'Check fit'}
        </button>
      </div>

      {!job.parsed && <p className="text-xs text-amber-600">Parse this job in the Library → Jobs tab first.</p>}
      {noResume && <p className="text-xs text-amber-600">Add your resume in Library → Resume — fit is scored against it.</p>}
      {stale && !analyzing && (
        <p className="text-xs text-amber-600">Your resume, the JD, or your stories changed since this was scored — re-check fit to refresh.</p>
      )}
      {analyzing && <Pending label="Scoring your resume against this job…" />}
      {error && <p className="text-sm text-red-600">{error}</p>}

      {/* Persisted snapshot when there's no fresh result this session. */}
      {!fit && savedFit && (
        <p className="text-xs text-stone-500">
          Last checked: <span className={`rounded-full px-2 py-0.5 font-medium capitalize ${VERDICT_STYLE[savedFit.verdict]}`}>{savedFit.verdict}</span>{' '}
          ({savedFit.score}/100) on {savedFit.at.slice(0, 10)}.
        </p>
      )}

      {fit && (
        <div className="space-y-4">
          <div className="flex items-center gap-4 rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-4 shadow-sm">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-stone-900 text-xl font-bold text-white">
              {fit.fitScore}
            </div>
            <div className="min-w-0">
              <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium capitalize ${VERDICT_STYLE[fit.verdict]}`}>{fit.verdict}</span>
              <p className="mt-1 text-sm text-stone-600">{fit.summary}</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-stone-200 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Seniority</p>
              <p className="mt-1 text-stone-700">
                JD: <span className="capitalize">{fit.seniorityMatch.jdLevel}</span> · Resume reads:{' '}
                <span className="capitalize">{fit.seniorityMatch.resumeImpliedLevel}</span>{' '}
                <span className={`font-medium ${fit.seniorityMatch.assessment === 'under' ? 'text-red-600' : fit.seniorityMatch.assessment === 'over' ? 'text-amber-600' : 'text-emerald-600'}`}>
                  ({fit.seniorityMatch.assessment})
                </span>
              </p>
              <p className="mt-1 text-xs text-stone-500">{fit.seniorityMatch.note}</p>
            </div>
            <div className="rounded-lg border border-stone-200 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Quantified impact</p>
              <p className="mt-1 text-stone-700">{fit.quantifiedImpact.score}/5</p>
              <p className="mt-1 text-xs text-stone-500">{fit.quantifiedImpact.note}</p>
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 p-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Requirement coverage</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {fit.requirementCoverage.map((r, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className={`mt-0.5 shrink-0 text-xs font-semibold uppercase ${STATUS_STYLE[r.status] ?? 'text-stone-500'}`}>{r.status}</span>
                  <span className="text-stone-700">
                    {r.requirement}
                    {r.evidence && <span className="text-stone-400"> — {r.evidence}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>

          <div className="rounded-lg border border-stone-200 p-3 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">ATS keywords · {fit.keywordCoverage.coveragePct}%</p>
            {fit.keywordCoverage.missing.length > 0 ? (
              <p className="mt-1 text-stone-600"><span className="text-red-600">Missing:</span> {fit.keywordCoverage.missing.join(', ')}</p>
            ) : (
              <p className="mt-1 text-emerald-600">All key terms covered.</p>
            )}
          </div>

          {fit.gaps.length > 0 && (
            <div className="rounded-lg border border-stone-200 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Gaps</p>
              <ul className="mt-2 space-y-2 text-sm">
                {fit.gaps.map((g, i) => (
                  <li key={i} className="rounded-md bg-stone-50 p-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-stone-800">{g.title}</span>
                      <span className="rounded-full bg-stone-200 px-2 py-0.5 text-[10px] font-medium text-stone-600">{FIX_LABEL[g.fixable] ?? g.fixable}</span>
                      <span className={`text-[10px] font-semibold uppercase ${g.severity === 'high' ? 'text-red-600' : g.severity === 'medium' ? 'text-amber-600' : 'text-stone-400'}`}>{g.severity}</span>
                    </div>
                    <p className="mt-0.5 text-stone-600">{g.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {fit.strengths.length > 0 && (
            <div className="rounded-lg border border-stone-200 p-3 text-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">Strengths</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-stone-700">
                {fit.strengths.map((s, i) => <li key={i}>{s}</li>)}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

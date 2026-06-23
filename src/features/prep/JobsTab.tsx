import { useCallback, useEffect, useState } from 'react'
import { listJobs, saveJob, deleteJob, emptyJob } from '../../lib/jobStore'
import { parseJobDescription } from '../../lib/resume/parseJob'
import type { JobDescription } from '../../types'

// The Jobs tab: paste a target job description; we parse it once into structure (skills, seniority,
// ATS keywords) and store it. Stored jobs are what the Match tab scores your resume against.

export default function JobsTab() {
  const [jobs, setJobs] = useState<JobDescription[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [rawText, setRawText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setJobs(await listJobs())
    setLoading(false)
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function addJob() {
    const text = rawText.trim()
    if (!text || busy) return
    setBusy(true)
    setError(null)
    try {
      const parsed = await parseJobDescription(text)
      const job: JobDescription = {
        ...emptyJob(crypto.randomUUID()),
        title: title.trim() || parsed.title || 'Untitled role',
        company: company.trim() || parsed.company || '',
        rawText: text,
        parsed,
      }
      const ok = await saveJob(job)
      if (!ok) throw new Error('save failed')
      setTitle('')
      setCompany('')
      setRawText('')
      await load()
    } catch {
      setError('Could not parse or save the job — is the backend running and an LLM key set?')
    } finally {
      setBusy(false)
    }
  }

  async function remove(job: JobDescription) {
    if (!window.confirm('Delete this job description?')) return
    await deleteJob(job.id)
    setJobs((prev) => prev.filter((j) => j.id !== job.id))
  }

  const inputCls = 'w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-terracotta-500 focus:outline-none'
  const labelCls = 'text-xs font-semibold uppercase tracking-wide text-stone-500'

  return (
    <div className="space-y-5">
      <div className="space-y-3 rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Title (optional)</label>
            <input className={`mt-1 ${inputCls}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Filled from the JD if blank" />
          </div>
          <div>
            <label className={labelCls}>Company (optional)</label>
            <input className={`mt-1 ${inputCls}`} value={company} onChange={(e) => setCompany(e.target.value)} />
          </div>
        </div>
        <div>
          <label className={labelCls}>Paste the job description</label>
          <textarea className={`mt-1 ${inputCls}`} rows={8} value={rawText} onChange={(e) => setRawText(e.target.value)} placeholder="Paste the full JD here…" />
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => void addJob()}
            disabled={busy || !rawText.trim()}
            className="rounded-md bg-terracotta-600 px-4 py-2 text-sm font-medium text-white hover:bg-terracotta-500 disabled:opacity-50"
          >
            {busy ? 'Parsing…' : 'Add & parse'}
          </button>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-stone-500">Loading…</p>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-stone-500">No job descriptions yet. Paste one above to measure your resume against it on the Match tab.</p>
      ) : (
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li key={j.id} className="rounded-lg border border-stone-200 p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-medium text-stone-800">{j.title || 'Untitled'}</span>
                    {j.company && <span className="text-xs text-stone-400">{j.company}</span>}
                    {j.parsed && (
                      <>
                        <span className="rounded-full bg-terracotta-100 px-2 py-0.5 text-[11px] capitalize text-terracotta-700">{j.parsed.seniority}</span>
                        <span className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">
                          {j.parsed.mustHaveSkills.length} must-haves
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <button type="button" onClick={() => remove(j)} className="shrink-0 rounded px-2 py-1 text-xs text-stone-400 hover:bg-red-50 hover:text-red-600">
                  Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

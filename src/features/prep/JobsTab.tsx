import { useCallback, useEffect, useState, type ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'
import { listJobs, saveJob, deleteJob, emptyJob } from '../../lib/jobStore'
import { parseJobDescription } from '../../lib/resume/parseJob'
import type { JobDescription } from '../../types'

// The Jobs tab: paste a target job description; we parse it once into structure (skills, seniority,
// ATS keywords) and store it. Each stored job becomes an application on the Pipeline, where its
// journey scores your resume, tailors one, and plans the interview loop.

export default function JobsTab() {
  const [jobs, setJobs] = useState<JobDescription[]>([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [company, setCompany] = useState('')
  const [rawText, setRawText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)

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
    setJobs((prev) => prev.filter((j) => j.id !== job.id)) // optimistic — no prompt
    await deleteJob(job.id)
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
        <p className="text-sm text-stone-500">No job descriptions yet. Paste one above — it becomes an application on the Pipeline.</p>
      ) : (
        <ul className="space-y-2">
          {jobs.map((j) => {
            const open = openId === j.id
            return (
              <li key={j.id} className="rounded-lg border border-stone-200">
                <div className="flex items-start justify-between gap-3 p-3">
                  <button
                    type="button"
                    onClick={() => setOpenId(open ? null : j.id)}
                    aria-expanded={open}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <ChevronDown className={`mt-0.5 h-4 w-4 shrink-0 text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
                    <span className="flex flex-wrap items-center gap-2">
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
                    </span>
                  </button>
                  <button type="button" onClick={() => remove(j)} className="shrink-0 rounded px-2 py-1 text-xs text-stone-400 hover:bg-red-50 hover:text-red-600">
                    Delete
                  </button>
                </div>
                {open && <JobDetails job={j} />}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

// The parsed structure + original text for one saved job, revealed when its row is expanded.
function JobDetails({ job }: { job: JobDescription }) {
  const p = job.parsed
  return (
    <div className="space-y-4 border-t border-stone-100 px-3 pb-3 pt-3">
      {p ? (
        <>
          {p.mustHaveSkills.length > 0 && (
            <Section label="Must-have skills">
              <div className="flex flex-wrap gap-1.5">
                {p.mustHaveSkills.map((s, i) => (
                  <span key={i} className="rounded-full bg-terracotta-50 px-2 py-0.5 text-[11px] text-terracotta-700 ring-1 ring-terracotta-200">
                    {s.skill}
                    {s.category && <span className="text-terracotta-400"> · {s.category}</span>}
                  </span>
                ))}
              </div>
            </Section>
          )}
          {p.niceToHaveSkills.length > 0 && (
            <Section label="Nice-to-have skills">
              <div className="flex flex-wrap gap-1.5">
                {p.niceToHaveSkills.map((s, i) => (
                  <span key={i} className="rounded-full bg-stone-100 px-2 py-0.5 text-[11px] text-stone-600">{s}</span>
                ))}
              </div>
            </Section>
          )}
          {p.responsibilities.length > 0 && (
            <Section label="Responsibilities">
              <ul className="list-disc space-y-0.5 pl-5 text-sm text-stone-600">
                {p.responsibilities.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            </Section>
          )}
          {p.keywords.length > 0 && (
            <Section label="ATS keywords">
              <div className="flex flex-wrap gap-1.5">
                {p.keywords.map((k, i) => (
                  <span key={i} className="rounded bg-stone-100 px-1.5 py-0.5 text-[11px] text-stone-500">{k}</span>
                ))}
              </div>
            </Section>
          )}
        </>
      ) : (
        <p className="text-xs text-stone-400">This job hasn't been parsed into structure.</p>
      )}
      {job.rawText.trim() && (
        <Section label="Original job description">
          <p className="max-h-64 overflow-y-auto whitespace-pre-wrap rounded-md bg-stone-50 p-3 text-xs text-stone-600">
            {job.rawText.trim()}
          </p>
        </Section>
      )}
    </div>
  )
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</div>
      {children}
    </div>
  )
}

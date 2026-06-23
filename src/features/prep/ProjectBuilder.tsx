import { useEffect, useState } from 'react'
import MicButton from '../../components/MicButton'
import { FACETS, type FacetAnswer, type FacetId, type Project } from '../../data/projects'
import FacetChat from './FacetChat'
import { hydrateProjectDrafts } from '../../lib/projects/facetDraftStore'
import type { BehavioralLevel } from '../../types'

// The level-aware project builder. Each facet is captured as a STAR conversation with the coach (see
// FacetChat) rather than a free-text box: the coach interviews to the target-level bar and writes
// the final answer. Capture is incremental — only a title is required to save; facets fill over time.

export default function ProjectBuilder({
  initial,
  targetLevel,
  onSave,
  onCancel,
}: {
  initial: Project
  targetLevel: BehavioralLevel
  onSave: (project: Project) => void
  onCancel: () => void
}) {
  const [title, setTitle] = useState(initial.title)
  const [roleRef, setRoleRef] = useState(initial.roleRef ?? '')
  const [summary, setSummary] = useState(initial.summary)
  const [facets, setFacets] = useState(initial.facets)
  // Mic for the summary: disabled while a take is in flight, errors surfaced under the field.
  const [summaryMicBusy, setSummaryMicBusy] = useState(false)
  const [summaryError, setSummaryError] = useState<string | null>(null)
  // Pull any server-saved facet drafts into the local cache, then signal children to recheck.
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    hydrateProjectDrafts(initial.id).finally(() => setHydrated(true))
  }, [initial.id])

  function setFacet(id: FacetId, value: FacetAnswer) {
    setFacets((f) => ({ ...f, [id]: value }))
  }

  function save() {
    onSave({
      ...initial,
      title: title.trim(),
      roleRef: roleRef.trim() || null,
      summary,
      facets,
      targetLevelAtCapture: targetLevel,
    })
  }

  const inputCls = 'w-full rounded-md border border-stone-300 px-3 py-1.5 text-sm focus:border-terracotta-500 focus:outline-none'
  const labelCls = 'text-xs font-semibold uppercase tracking-wide text-stone-500'

  return (
    <div className="space-y-4 rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Project title</label>
          <input className={`mt-1 ${inputCls}`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Event-driven billing rewrite" />
        </div>
        <div>
          <label className={labelCls}>Role / company</label>
          <input className={`mt-1 ${inputCls}`} value={roleRef} onChange={(e) => setRoleRef(e.target.value)} placeholder="e.g. Senior Eng, Acme" />
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <label className={labelCls}>What was built</label>
          <MicButton
            disabled={summaryMicBusy}
            onBusyChange={setSummaryMicBusy}
            onError={setSummaryError}
            onTranscript={(text) => {
              setSummaryError(null)
              setSummary((prev) => (prev ? `${prev} ${text}` : text))
            }}
          />
        </div>
        <textarea
          className={`mt-1 ${inputCls}`}
          rows={2}
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          disabled={summaryMicBusy}
          placeholder="1–2 sentences: the system, your role, the scope, and the outcome that mattered."
        />
        <p className="mt-1 text-xs text-stone-500">
          1–2 sentences of context — the coach uses this to interview you on the facets below, so keep
          the STAR detail for them. Aim to cover:{' '}
          <span className="font-medium text-stone-600">what the system is</span>,{' '}
          <span className="font-medium text-stone-600">your role &amp; scope</span>,{' '}
          <span className="font-medium text-stone-600">scale or stakes</span>, and{' '}
          <span className="font-medium text-stone-600">the outcome that mattered</span>.
        </p>
        {summaryError && <p className="mt-1 text-xs text-red-600">{summaryError}</p>}
      </div>

      <div className="space-y-4 border-t border-stone-100 pt-4">
        <p className="text-xs text-stone-500">
          Capturing for a <span className="font-semibold capitalize">{targetLevel}</span> bar. Fill what you can — facets fill over time.
        </p>
        {FACETS.map((facet) => (
          <FacetChat
            key={facet.id}
            projectId={initial.id}
            facet={facet}
            value={facets[facet.id]}
            project={{ title, summary }}
            targetLevel={targetLevel}
            hydrated={hydrated}
            onChange={(value) => setFacet(facet.id, value)}
          />
        ))}
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

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { listSessions, getSession, deleteSession, type SessionKind, type SessionSummary } from '../../lib/sessionStore'

// Cross-mode history of every past session (behavioral, system-design, and future kinds).
// Opening a row loads the full record and hands it to the matching feature route via router
// state, which hydrates it (resume an in-progress interview, or view a completed result).

const KIND_LABEL: Record<string, string> = { behavioral: 'Behavioral', sysdesign: 'System design', build: 'Build' }
const ROUTE_FOR: Record<string, string> = {
  behavioral: '/interview/behavioral',
  sysdesign: '/interview/sysdesign',
  build: '/interview/build',
}
const KIND_BADGE: Record<string, string> = {
  behavioral: 'bg-indigo-100 text-indigo-700',
  sysdesign: 'bg-emerald-100 text-emerald-700',
  build: 'bg-violet-100 text-violet-700',
}

function relativeDate(iso: string): string {
  const then = new Date(iso).getTime()
  const diff = Date.now() - then
  const min = Math.round(diff / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}

const FILTERS: Array<{ value: SessionKind | 'all'; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'behavioral', label: 'Behavioral' },
  { value: 'sysdesign', label: 'System design' },
  { value: 'build', label: 'Build' },
]

export default function SessionHistory() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<SessionKind | 'all'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    const data = await listSessions(filter === 'all' ? {} : { kind: filter })
    setRows(data)
    setLoading(false)
  }, [filter])

  useEffect(() => {
    void load()
  }, [load])

  async function open(row: SessionSummary) {
    const session = await getSession(row.id)
    const route = ROUTE_FOR[row.kind]
    if (!session || !route) return
    navigate(route, { state: { session } })
  }

  async function remove(row: SessionSummary, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this session? This cannot be undone.')) return
    await deleteSession(row.id)
    setRows((prev) => prev.filter((r) => r.id !== row.id))
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-slate-900">Past sessions</h2>
        <div className="inline-flex rounded-md border border-slate-200 p-0.5 text-xs">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded px-2.5 py-1 ${filter === f.value ? 'bg-slate-800 text-white' : 'text-slate-600'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-slate-500">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">
          No saved sessions yet. Complete a behavioral or system-design session and it’ll show up
          here. (Durable history needs the backend running — see the README.)
        </p>
      ) : (
        <ul className="mt-4 space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => open(row)}
                className="group flex w-full items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 text-left hover:border-indigo-300 hover:bg-indigo-50/40"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${KIND_BADGE[row.kind] || 'bg-slate-100 text-slate-600'}`}>
                      {KIND_LABEL[row.kind] || row.kind}
                    </span>
                    <span className="truncate text-sm font-medium text-slate-800">{row.title || 'Untitled'}</span>
                  </div>
                  <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                    <span>{relativeDate(row.updated_at)}</span>
                    <span>·</span>
                    <span>{row.status === 'completed' ? 'Completed' : 'In progress'}</span>
                    {row.level && (
                      <>
                        <span>·</span>
                        <span className="capitalize">{row.level}</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    onClick={(e) => remove(row, e)}
                    className="rounded px-2 py-1 text-xs text-slate-400 hover:bg-red-50 hover:text-red-600"
                    role="button"
                    tabIndex={0}
                  >
                    Delete
                  </span>
                  <span className="text-indigo-500 group-hover:translate-x-0.5">→</span>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

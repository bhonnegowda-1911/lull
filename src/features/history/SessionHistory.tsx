import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { MessageSquare, Code2, Network, Hammer, Mic, ArrowRight, Trash2, type LucideIcon } from 'lucide-react'
import { listSessions, getSession, deleteSession, type SessionKind, type SessionSummary } from '../../lib/sessionStore'
import { stagger, staggerItem } from '../../lib/ui/motion'
import EmptyState from '../../components/EmptyState'

// Cross-mode history of completed sessions (behavioral, system-design, and future kinds).
// In-progress runs are excluded — only completed sessions are listed. Opening a row loads
// the full record and hands it to the matching feature route via router state to view it.

const KIND_LABEL: Record<string, string> = { behavioral: 'Behavioral', coding: 'Coding', sysdesign: 'System design', build: 'Build', interview_review: 'Interview review' }
const ROUTE_FOR: Record<string, string> = {
  behavioral: '/practice/behavioral',
  coding: '/practice/coding',
  sysdesign: '/practice/sysdesign',
  build: '/practice/build',
  interview_review: '/review',
}
const KIND_BADGE: Record<string, string> = {
  behavioral: 'bg-terracotta-100 text-terracotta-700',
  coding: 'bg-sky-100 text-sky-700',
  sysdesign: 'bg-emerald-100 text-emerald-700',
  build: 'bg-violet-100 text-violet-700',
  interview_review: 'bg-amber-100 text-amber-700',
}
const KIND_ICON: Record<string, LucideIcon> = {
  behavioral: MessageSquare,
  coding: Code2,
  sysdesign: Network,
  build: Hammer,
  interview_review: Mic,
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
  { value: 'coding', label: 'Coding' },
  { value: 'sysdesign', label: 'System design' },
  { value: 'build', label: 'Build' },
  { value: 'interview_review', label: 'Interview review' },
]

export default function SessionHistory() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<SessionSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<SessionKind | 'all'>('all')

  const load = useCallback(async () => {
    setLoading(true)
    // Past sessions shows only completed runs (in-progress sessions are excluded).
    const data = await listSessions(filter === 'all' ? { status: 'completed' } : { status: 'completed', kind: filter })
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
    <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-stone-900">Past sessions</h2>
        <div className="inline-flex rounded-md border border-stone-200 p-0.5 text-xs">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => setFilter(f.value)}
              className={`rounded px-2.5 py-1 ${filter === f.value ? 'bg-stone-800 text-white' : 'text-stone-600'}`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className="mt-4 text-sm text-stone-500">Loading…</p>
      ) : rows.length === 0 ? (
        <EmptyState
          className="mt-4"
          icon={
            <svg className="h-6 w-6" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 12a9 9 0 1 0 9-9 9.7 9.7 0 0 0-6.7 2.9L3 8" />
              <path d="M3 4v4h4M12 7v5l3 2" />
            </svg>
          }
          title="No saved sessions yet"
          description="Complete a behavioral or system-design session and it’ll show up here. (Durable history needs the backend running — see the README.)"
        />
      ) : (
        <motion.ul variants={stagger} initial="hidden" animate="show" className="mt-4 space-y-2">
          {rows.map((row) => {
            const Icon = KIND_ICON[row.kind]
            return (
              <motion.li key={row.id} variants={staggerItem}>
                <button
                  type="button"
                  onClick={() => open(row)}
                  className="group flex w-full items-center justify-between gap-3 rounded-lg border border-stone-200 p-3 text-left transition-colors hover:border-terracotta-300 hover:bg-terracotta-50/40"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    {Icon && (
                      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${KIND_BADGE[row.kind] || 'bg-stone-100 text-stone-600'}`}>
                        <Icon size={16} aria-hidden />
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-stone-800">{row.title || 'Untitled'}</span>
                        {row.status === 'completed' && (
                          <span className="shrink-0 rounded-full bg-emerald-100 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">Done</span>
                        )}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 text-xs text-stone-400">
                        <span>{KIND_LABEL[row.kind] || row.kind}</span>
                        <span>·</span>
                        <span>{relativeDate(row.updated_at)}</span>
                        {row.status !== 'completed' && (
                          <>
                            <span>·</span>
                            <span className="text-amber-600">In progress</span>
                          </>
                        )}
                        {row.level && (
                          <>
                            <span>·</span>
                            <span className="capitalize">{row.level}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <span
                      onClick={(e) => remove(row, e)}
                      className="grid h-7 w-7 place-items-center rounded text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600"
                      role="button"
                      tabIndex={0}
                      aria-label="Delete session"
                    >
                      <Trash2 size={14} aria-hidden />
                    </span>
                    <ArrowRight size={16} className="text-terracotta-400 transition-transform group-hover:translate-x-0.5 group-hover:text-terracotta-600" aria-hidden />
                  </div>
                </button>
              </motion.li>
            )
          })}
        </motion.ul>
      )}
    </div>
  )
}

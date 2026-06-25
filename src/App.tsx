import { useEffect, useRef, useState } from 'react'
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  LayoutDashboard,
  Library as LibraryIcon,
  MessageSquare,
  Code2,
  Network,
  Hammer,
  Mic,
  TrendingUp,
  Gauge,
  History as HistoryIcon,
  Settings as SettingsIcon,
  Menu as MenuIcon,
  X as XIcon,
  ChevronDown,
  type LucideIcon,
} from 'lucide-react'
import { pageTransition } from './lib/ui/motion'
import { useApiKeys } from './context/ApiKeyContext'
import SettingsModal from './components/SettingsModal'
import Logo from './components/Logo'
import BehavioralView from './components/BehavioralView'
import SystemDesignSession from './components/sysdesign/SystemDesignSession'
import CodingSession from './components/coding/CodingSession'
import BuildSession from './components/build/BuildSession'
import SessionHistory from './features/history/SessionHistory'
import Progress from './features/progress/Progress'
import PrepHub from './features/prep/PrepHub'
import PipelineHome from './features/pipeline/PipelineHome'
import ApplicationJourney from './features/prep/ApplicationJourney'
import MetricsDashboard from './features/metrics/MetricsDashboard'
import InterviewReviewView from './features/review/InterviewReviewView'

// App shell: top nav + routed feature views. The Pipeline (home) orchestrates the application
// journey; Library holds the ground-truth tiers; Practice holds the interview-rep modes (reached
// both directly and via Practice → deep-links from a journey). The shell owns the LLM-config modal
// and hands views an `onNeedKeys` callback to surface it.
//
// Nav is grouped to keep the bar calm: two primary links (Pipeline, Library) plus two dropdowns —
// Practice (the rep modes) and Insights (Progress/Outcomes/History). Mobile renders the same groups
// as labeled sections in the sheet.

type NavLeaf = { to: string; label: string; end?: boolean; icon: LucideIcon }
type NavGroup = { id: string; label: string; items: NavLeaf[] }

const PRIMARY: NavLeaf[] = [
  { to: '/', label: 'Pipeline', end: true, icon: LayoutDashboard },
  { to: '/library', label: 'Library', icon: LibraryIcon },
]

const GROUPS: NavGroup[] = [
  {
    id: 'practice',
    label: 'Practice',
    items: [
      { to: '/practice/behavioral', label: 'Behavioral', icon: MessageSquare },
      { to: '/practice/coding', label: 'Coding', icon: Code2 },
      { to: '/practice/sysdesign', label: 'System design', icon: Network },
      { to: '/practice/build', label: 'Build', icon: Hammer },
      { to: '/review', label: 'Review', icon: Mic },
    ],
  },
  {
    id: 'insights',
    label: 'Insights',
    items: [
      { to: '/progress', label: 'Progress', icon: TrendingUp },
      { to: '/metrics', label: 'Outcomes', icon: Gauge },
      { to: '/history', label: 'History', icon: HistoryIcon },
    ],
  },
]

function isLeafActive(leaf: NavLeaf, pathname: string): boolean {
  return leaf.end ? pathname === leaf.to : pathname === leaf.to || pathname.startsWith(leaf.to + '/')
}
function isGroupActive(group: NavGroup, pathname: string): boolean {
  return group.items.some((l) => isLeafActive(l, pathname))
}

// One desktop nav dropdown (Practice / Insights). The trigger hosts the shared active pill when the
// current route lives in the group, so the highlight animates between top-level slots like before.
function NavDropdown({
  group,
  open,
  onToggle,
  onClose,
  pathname,
}: {
  group: NavGroup
  open: boolean
  onToggle: () => void
  onClose: () => void
  pathname: string
}) {
  const active = isGroupActive(group, pathname)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-haspopup="menu"
        aria-expanded={open}
        className={`relative flex items-center gap-1 rounded-full px-3 py-1 transition-colors ${
          active ? 'text-white' : open ? 'text-stone-900' : 'text-stone-600 hover:text-stone-900'
        }`}
      >
        {active && (
          <motion.span
            layoutId="nav-pill"
            className="absolute inset-0 rounded-full bg-[#b5552f] shadow-sm"
            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
          />
        )}
        <span className="relative z-10">{group.label}</span>
        <ChevronDown
          size={13}
          aria-hidden
          className={`relative z-10 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15, ease: [0.16, 1, 0.3, 1] }}
            role="menu"
            className="absolute right-0 z-20 mt-2 w-52 overflow-hidden rounded-xl border border-stone-200 bg-white p-1 shadow-lg"
          >
            {group.items.map((leaf) => {
              const Icon = leaf.icon
              const la = isLeafActive(leaf, pathname)
              return (
                <Link
                  key={leaf.to}
                  to={leaf.to}
                  onClick={onClose}
                  role="menuitem"
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    la ? 'bg-terracotta-50 font-medium text-terracotta-700' : 'text-stone-700 hover:bg-stone-50'
                  }`}
                >
                  <Icon size={15} aria-hidden /> {leaf.label}
                </Link>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function App() {
  const { hasAllKeys, online } = useApiKeys()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [openMenu, setOpenMenu] = useState<string | null>(null)
  const navRef = useRef<HTMLElement>(null)
  const openSettings = () => setSettingsOpen(true)
  const location = useLocation()

  // Close the mobile sheet and any open desktop dropdown whenever the route changes.
  useEffect(() => {
    setMobileOpen(false)
    setOpenMenu(null)
  }, [location.pathname])

  // Dismiss an open desktop dropdown on outside click or Escape.
  useEffect(() => {
    if (!openMenu) return
    function onDocPointer(e: MouseEvent) {
      if (navRef.current && !navRef.current.contains(e.target as Node)) setOpenMenu(null)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpenMenu(null)
    }
    document.addEventListener('mousedown', onDocPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [openMenu])

  const renderMobileLeaf = (leaf: NavLeaf) => {
    const Icon = leaf.icon
    return (
      <NavLink
        key={leaf.to}
        to={leaf.to}
        end={leaf.end}
        className={({ isActive }) =>
          `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
            isActive ? 'bg-[#b5552f] font-medium text-white' : 'text-stone-700 hover:bg-white'
          }`
        }
      >
        <Icon size={16} aria-hidden />
        {leaf.label}
      </NavLink>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f9f5ee] to-[#f1e8da] text-stone-800">
      <header className="sticky top-0 z-10 border-b border-stone-200/70 bg-[#fbf8f1]/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <Logo size={36} className="shrink-0" />
            <div className="min-w-0">
              <h1 className="font-serif text-xl font-semibold tracking-tight text-stone-900">Lull</h1>
              <p className="truncate text-xs text-stone-500">Quiet the noise before the interview.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {/* Desktop nav — hidden on small screens in favor of the hamburger below. */}
            <nav
              ref={navRef}
              className="hidden items-center rounded-full border border-stone-200 bg-white/60 p-0.5 text-sm shadow-sm md:inline-flex"
            >
              {PRIMARY.map((item) => {
                const Icon = item.icon
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    className={({ isActive }) =>
                      `relative flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors ${
                        isActive ? 'text-white' : 'text-stone-600 hover:text-stone-900'
                      }`
                    }
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && (
                          <motion.span
                            layoutId="nav-pill"
                            className="absolute inset-0 rounded-full bg-[#b5552f] shadow-sm"
                            transition={{ type: 'spring', stiffness: 500, damping: 38 }}
                          />
                        )}
                        <Icon size={14} className="relative z-10" aria-hidden />
                        <span className="relative z-10">{item.label}</span>
                      </>
                    )}
                  </NavLink>
                )
              })}
              {GROUPS.map((group) => (
                <NavDropdown
                  key={group.id}
                  group={group}
                  pathname={location.pathname}
                  open={openMenu === group.id}
                  onToggle={() => setOpenMenu((cur) => (cur === group.id ? null : group.id))}
                  onClose={() => setOpenMenu(null)}
                />
              ))}
            </nav>
            {online && !hasAllKeys && (
              <span className="hidden text-xs text-amber-700 sm:inline">LLM not configured</span>
            )}
            {!online && <span className="hidden text-xs text-red-600 sm:inline">Backend offline</span>}
            {/* Desktop settings button. */}
            <button
              type="button"
              onClick={openSettings}
              className="hidden items-center gap-1.5 rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 transition-colors hover:bg-white md:flex"
            >
              <SettingsIcon size={14} aria-hidden />
              Settings
            </button>
            {/* Mobile hamburger. */}
            <button
              type="button"
              onClick={() => setMobileOpen((v) => !v)}
              aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
              aria-expanded={mobileOpen}
              className="grid h-9 w-9 place-items-center rounded-full border border-stone-300 text-stone-700 transition-colors hover:bg-white md:hidden"
            >
              {mobileOpen ? <XIcon size={18} aria-hidden /> : <MenuIcon size={18} aria-hidden />}
            </button>
          </div>
        </div>

        {/* Mobile menu — a vertical sheet under the header bar. */}
        <AnimatePresence>
          {mobileOpen && (
            <motion.nav
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              className="overflow-hidden border-t border-stone-200/70 md:hidden"
            >
              <div className="mx-auto grid max-w-5xl gap-1 px-4 py-3">
                {PRIMARY.map(renderMobileLeaf)}
                {GROUPS.map((group) => (
                  <div key={group.id} className="mt-1">
                    <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                      {group.label}
                    </p>
                    {group.items.map(renderMobileLeaf)}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => {
                    setMobileOpen(false)
                    openSettings()
                  }}
                  className="mt-1 flex items-center gap-2.5 rounded-lg border-t border-stone-200/70 px-3 py-2 text-sm text-stone-700 transition-colors hover:bg-white"
                >
                  <SettingsIcon size={16} aria-hidden />
                  Settings
                </button>
                {online && !hasAllKeys && <span className="px-3 text-xs text-amber-700">LLM not configured</span>}
                {!online && <span className="px-3 text-xs text-red-600">Backend offline</span>}
              </div>
            </motion.nav>
          )}
        </AnimatePresence>

        {/* Thin editorial rule under the header. */}
        <div className="h-px bg-gradient-to-r from-amber-400/70 via-orange-300/40 to-transparent" />
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <AnimatePresence mode="wait">
          <motion.div
            key={location.pathname.split('/').slice(0, 3).join('/')}
            variants={pageTransition}
            initial="hidden"
            animate="show"
            exit="exit"
          >
            <Routes location={location}>
          <Route path="/" element={<PipelineHome />} />
          <Route path="/app/:jobId" element={<ApplicationJourney />} />
          <Route path="/library" element={<PrepHub />} />
          <Route path="/practice/behavioral" element={<BehavioralView onNeedKeys={openSettings} />} />
          <Route path="/practice/coding" element={<CodingSession onNeedKeys={openSettings} />} />
          <Route path="/practice/sysdesign" element={<SystemDesignSession onNeedKeys={openSettings} />} />
          <Route path="/practice/build" element={<BuildSession onNeedKeys={openSettings} />} />
          <Route path="/review" element={<InterviewReviewView onNeedKeys={openSettings} />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/metrics" element={<MetricsDashboard />} />
          <Route path="/history" element={<SessionHistory />} />
          {/* Back-compat: old /interview/* and /prep paths and any Practice → deep-links. */}
          <Route path="/interview/behavioral" element={<Navigate to="/practice/behavioral" replace />} />
          <Route path="/interview/coding" element={<Navigate to="/practice/coding" replace />} />
          <Route path="/interview/sysdesign" element={<Navigate to="/practice/sysdesign" replace />} />
          <Route path="/interview/build" element={<Navigate to="/practice/build" replace />} />
          <Route path="/prep" element={<Navigate to="/library" replace />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </motion.div>
        </AnimatePresence>
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

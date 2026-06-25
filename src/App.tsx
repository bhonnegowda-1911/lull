import { useEffect, useState } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom'
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

const NAV: { to: string; label: string; end?: boolean; icon: LucideIcon }[] = [
  { to: '/', label: 'Pipeline', end: true, icon: LayoutDashboard },
  { to: '/library', label: 'Library', icon: LibraryIcon },
  { to: '/practice/behavioral', label: 'Behavioral', icon: MessageSquare },
  { to: '/practice/coding', label: 'Coding', icon: Code2 },
  { to: '/practice/sysdesign', label: 'System design', icon: Network },
  { to: '/practice/build', label: 'Build', icon: Hammer },
  { to: '/review', label: 'Review', icon: Mic },
  { to: '/progress', label: 'Progress', icon: TrendingUp },
  { to: '/metrics', label: 'Outcomes', icon: Gauge },
  { to: '/history', label: 'History', icon: HistoryIcon },
]

export default function App() {
  const { hasAllKeys, online } = useApiKeys()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const openSettings = () => setSettingsOpen(true)
  const location = useLocation()

  // Close the mobile menu whenever the route changes (e.g. after tapping a link).
  useEffect(() => setMobileOpen(false), [location.pathname])

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
            <nav className="hidden rounded-full border border-stone-200 bg-white/60 p-0.5 text-sm shadow-sm md:inline-flex">
              {NAV.map((item) => {
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
                {NAV.map((item) => {
                  const Icon = item.icon
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                          isActive ? 'bg-[#b5552f] font-medium text-white' : 'text-stone-700 hover:bg-white'
                        }`
                      }
                    >
                      <Icon size={16} aria-hidden />
                      {item.label}
                    </NavLink>
                  )
                })}
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

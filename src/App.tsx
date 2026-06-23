import { useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useApiKeys } from './context/ApiKeyContext'
import SettingsModal from './components/SettingsModal'
import BehavioralView from './components/BehavioralView'
import SystemDesignSession from './components/sysdesign/SystemDesignSession'
import BuildSession from './components/build/BuildSession'
import SessionHistory from './features/history/SessionHistory'
import Progress from './features/progress/Progress'
import PrepHub from './features/prep/PrepHub'

// App shell: top nav + routed feature views. Each feature is a route so new ones (resume,
// jobs, tutor) slot in without reworking this file. The shell owns the LLM-config modal and
// hands views an `onNeedKeys` callback to surface it.

const NAV = [
  { to: '/interview/behavioral', label: 'Behavioral' },
  { to: '/interview/sysdesign', label: 'System design' },
  { to: '/interview/build', label: 'Build' },
  { to: '/prep', label: 'Prep' },
  { to: '/progress', label: 'Progress' },
  { to: '/history', label: 'History' },
]

export default function App() {
  const { hasAllKeys, online } = useApiKeys()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = () => setSettingsOpen(true)

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#f9f5ee] to-[#f1e8da] text-stone-800">
      <header className="sticky top-0 z-10 border-b border-stone-200/70 bg-[#fbf8f1]/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div>
            <h1 className="font-serif text-xl font-semibold tracking-tight text-stone-900">Interview Coach</h1>
            <p className="text-xs text-stone-500">Practice interviews, review past sessions, and track progress.</p>
          </div>
          <div className="flex items-center gap-3">
            <nav className="inline-flex rounded-full border border-stone-200 bg-white/60 p-0.5 text-sm shadow-sm">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded-full px-3 py-1 transition-colors ${
                      isActive ? 'bg-[#b5552f] text-white shadow-sm' : 'text-stone-600 hover:text-stone-900'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            {online && !hasAllKeys && (
              <span className="hidden text-xs text-amber-700 sm:inline">LLM not configured</span>
            )}
            {!online && <span className="hidden text-xs text-red-600 sm:inline">Backend offline</span>}
            <button
              type="button"
              onClick={openSettings}
              className="rounded-full border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-white"
            >
              Settings
            </button>
          </div>
        </div>
        {/* Thin editorial rule under the header. */}
        <div className="h-px bg-gradient-to-r from-amber-400/70 via-orange-300/40 to-transparent" />
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/interview/behavioral" replace />} />
          <Route path="/interview/behavioral" element={<BehavioralView onNeedKeys={openSettings} />} />
          <Route path="/interview/sysdesign" element={<SystemDesignSession onNeedKeys={openSettings} />} />
          <Route path="/interview/build" element={<BuildSession onNeedKeys={openSettings} />} />
          <Route path="/prep" element={<PrepHub />} />
          <Route path="/progress" element={<Progress />} />
          <Route path="/history" element={<SessionHistory />} />
          <Route path="*" element={<Navigate to="/interview/behavioral" replace />} />
        </Routes>
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

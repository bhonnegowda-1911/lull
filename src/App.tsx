import { useState } from 'react'
import { NavLink, Navigate, Route, Routes } from 'react-router-dom'
import { useApiKeys } from './context/ApiKeyContext'
import SettingsModal from './components/SettingsModal'
import BehavioralView from './components/BehavioralView'
import SystemDesignSession from './components/sysdesign/SystemDesignSession'
import BuildSession from './components/build/BuildSession'
import SessionHistory from './features/history/SessionHistory'

// App shell: top nav + routed feature views. Each feature is a route so new ones (resume,
// jobs, tutor) slot in without reworking this file. The shell owns the LLM-config modal and
// hands views an `onNeedKeys` callback to surface it.

const NAV = [
  { to: '/interview/behavioral', label: 'Behavioral' },
  { to: '/interview/sysdesign', label: 'System design' },
  { to: '/interview/build', label: 'Build' },
  { to: '/history', label: 'History' },
]

export default function App() {
  const { hasAllKeys, online } = useApiKeys()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const openSettings = () => setSettingsOpen(true)

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Interview Coach</h1>
            <p className="text-xs text-slate-500">Practice interviews, review past sessions, and track progress.</p>
          </div>
          <div className="flex items-center gap-3">
            <nav className="inline-flex rounded-md border border-slate-200 p-0.5 text-sm">
              {NAV.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `rounded px-3 py-1 ${isActive ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:text-slate-900'}`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
            </nav>
            {online && !hasAllKeys && (
              <span className="hidden text-xs text-amber-600 sm:inline">LLM not configured</span>
            )}
            {!online && <span className="hidden text-xs text-red-600 sm:inline">Backend offline</span>}
            <button
              type="button"
              onClick={openSettings}
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Settings
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-6">
        <Routes>
          <Route path="/" element={<Navigate to="/interview/behavioral" replace />} />
          <Route path="/interview/behavioral" element={<BehavioralView onNeedKeys={openSettings} />} />
          <Route path="/interview/sysdesign" element={<SystemDesignSession onNeedKeys={openSettings} />} />
          <Route path="/interview/build" element={<BuildSession onNeedKeys={openSettings} />} />
          <Route path="/history" element={<SessionHistory />} />
          <Route path="*" element={<Navigate to="/interview/behavioral" replace />} />
        </Routes>
      </main>

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}

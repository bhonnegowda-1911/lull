import { useEffect, useState } from 'react'
import { getProfile, saveProfile } from '../../lib/profileStore'
import { saveProject } from '../../lib/projectStore'
import { bootstrapProjects } from '../../lib/projects/bootstrap'
import { DEFAULT_PROFILE, type Profile } from '../../data/stories'
import { emptyProject } from '../../data/projects'
import type { BehavioralLevel } from '../../types'

// The Resume tab of the Prep hub: your thin public artifact (what INTERVIEW mode sees) plus the
// target level that calibrates follow-ups and the project builder. "Bootstrap projects" seeds the
// Projects tab with skeletons from the resume — the deep facets are captured there.

const TARGET_LEVELS: BehavioralLevel[] = ['mid', 'senior', 'staff', 'principal']

export default function ResumeTab({ onBootstrapped }: { onBootstrapped?: () => void }) {
  const [profile, setProfile] = useState<Profile>(DEFAULT_PROFILE)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState<string | null>(null)
  const [bootstrapMsg, setBootstrapMsg] = useState<string | null>(null)
  const [bootstrapping, setBootstrapping] = useState(false)

  useEffect(() => {
    getProfile().then(setProfile)
  }, [])

  async function persist() {
    setSaving(true)
    await saveProfile(profile)
    setSaving(false)
    setSavedMsg('Saved.')
    setTimeout(() => setSavedMsg(null), 1500)
  }

  async function bootstrap() {
    setBootstrapping(true)
    setBootstrapMsg('Reading your resume…')
    try {
      await saveProfile(profile)
      const skeletons = await bootstrapProjects(profile.resumeText)
      for (const s of skeletons) {
        await saveProject({ ...emptyProject(crypto.randomUUID()), title: s.title, roleRef: s.roleRef || null, summary: s.summary })
      }
      setBootstrapMsg(
        skeletons.length ? `Added ${skeletons.length} projects — flesh them out under Projects.` : 'No projects found in the resume.',
      )
      if (skeletons.length) onBootstrapped?.()
    } catch {
      setBootstrapMsg('Could not bootstrap projects (is the backend running?).')
    } finally {
      setBootstrapping(false)
    }
  }

  const inputCls = 'mt-1 w-full rounded-md border border-stone-300 px-3 py-2 text-sm focus:border-terracotta-500 focus:outline-none'
  const labelCls = 'block text-xs font-semibold uppercase tracking-wide text-stone-500'

  return (
    <div className="space-y-4 rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
      <div>
        <h3 className="text-sm font-semibold text-stone-700">Resume & target level</h3>
        <p className="mt-0.5 text-xs text-stone-500">
          Interview mode shows the interviewer only your resume and holds you to your target level.
          Coaching mode adds your projects + stories on top.
        </p>
      </div>

      <div>
        <label className={labelCls}>Target level</label>
        <select
          value={profile.targetLevel}
          onChange={(e) => setProfile((p) => ({ ...p, targetLevel: e.target.value as BehavioralLevel }))}
          className={`${inputCls} capitalize`}
        >
          {TARGET_LEVELS.map((l) => (
            <option key={l} value={l} className="capitalize">{l}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelCls}>Resume</label>
        <textarea
          value={profile.resumeText}
          onChange={(e) => setProfile((p) => ({ ...p, resumeText: e.target.value }))}
          rows={12}
          placeholder="Paste your resume here…"
          className={inputCls}
        />
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={persist}
          disabled={saving}
          className="rounded-md bg-terracotta-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-terracotta-500 disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
        <button
          type="button"
          onClick={bootstrap}
          disabled={bootstrapping || !profile.resumeText.trim()}
          className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          {bootstrapping ? 'Working…' : 'Bootstrap projects from resume'}
        </button>
        {savedMsg && <span className="text-xs text-green-600">{savedMsg}</span>}
      </div>
      {bootstrapMsg && <p className="text-xs text-stone-500">{bootstrapMsg}</p>}
    </div>
  )
}

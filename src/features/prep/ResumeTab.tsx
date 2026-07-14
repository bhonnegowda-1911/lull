import { useEffect, useRef, useState } from 'react'
import { getProfile, saveProfile } from '../../lib/profileStore'
import { saveProject } from '../../lib/projectStore'
import { bootstrapProjects } from '../../lib/projects/bootstrap'
import { parseResumeFile } from '../../lib/resume/parseFile'
import { uploadAsset, assetUrl } from '../../lib/assetStore'
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
  const [uploadMsg, setUploadMsg] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  // A blob: URL for the just-uploaded file so the PDF renders instantly this session (before/without a
  // stored asset). Revoked when replaced or on unmount so we don't leak object URLs.
  const [localFileUrl, setLocalFileUrl] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    getProfile().then(setProfile)
  }, [])

  useEffect(() => {
    return () => {
      if (localFileUrl) URL.revokeObjectURL(localFileUrl)
    }
  }, [localFileUrl])

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-uploading the same file
    if (!file) return
    setUploading(true)
    setUploadMsg('Reading your file…')
    try {
      const { text, style, fileType, html } = await parseResumeFile(file)
      // Show the real file immediately from a local blob URL.
      setLocalFileUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev)
        return URL.createObjectURL(file)
      })
      // Persist the original file so the exact document survives a reload (needs the backend).
      const asset = await uploadAsset(file, { kind: fileType === 'pdf' ? 'pdf' : 'file', filename: file.name })
      const next: Profile = {
        ...profile,
        resumeText: text,
        resumeStyle: style,
        resumeFileType: fileType,
        resumeHtml: fileType === 'docx' ? html ?? null : null,
        resumeAssetId: asset?.id ?? null,
      }
      setProfile(next)
      await saveProfile(next)
      setUploadMsg(
        asset
          ? `Imported ${file.name}.`
          : `Imported ${file.name} — showing it for this session, but it couldn't be saved (is the backend running?).`,
      )
    } catch (err) {
      setUploadMsg(err instanceof Error ? err.message : 'Could not read that file.')
    } finally {
      setUploading(false)
    }
  }

  // The URL to render the original PDF from: this session's blob, else the stored asset.
  const pdfUrl = profile.resumeFileType === 'pdf' ? localFileUrl ?? (profile.resumeAssetId ? assetUrl(profile.resumeAssetId) : null) : null

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
        <div className="flex items-center justify-between">
          <label className={labelCls}>Resume</label>
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              onChange={(e) => void onFile(e)}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="rounded-md border border-stone-300 px-2.5 py-1 text-xs font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
            >
              {uploading ? 'Reading…' : profile.resumeText.trim() ? 'Replace file' : 'Upload PDF / Word'}
            </button>
          </div>
        </div>
        {pdfUrl ? (
          // Embed the actual uploaded PDF — exact fidelity to what the candidate uploaded.
          <iframe title="Your resume" src={pdfUrl} className="mt-1 h-[36rem] w-full rounded-md border border-stone-300 bg-white" />
        ) : profile.resumeFileType === 'docx' && profile.resumeHtml ? (
          // Word can't be embedded natively — render the converted HTML (close, not pixel-exact).
          <div
            className="prose prose-sm mt-1 max-h-[36rem] max-w-none overflow-auto rounded-md border border-stone-300 bg-white px-4 py-3 text-stone-800"
            dangerouslySetInnerHTML={{ __html: profile.resumeHtml }}
          />
        ) : profile.resumeText.trim() ? (
          <pre className="mt-1 max-h-96 overflow-auto whitespace-pre-wrap rounded-md border border-stone-300 bg-white px-3 py-2 font-sans text-sm text-stone-700">
            {profile.resumeText}
          </pre>
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="mt-1 flex w-full flex-col items-center justify-center gap-1 rounded-md border border-dashed border-stone-300 px-3 py-10 text-sm text-stone-500 hover:border-terracotta-400 hover:bg-terracotta-50/40 disabled:opacity-50"
          >
            <span className="font-medium text-stone-600">Upload your resume</span>
            <span className="text-xs text-stone-400">PDF or Word (.docx) — the original file is shown and its text captured</span>
          </button>
        )}
        {uploadMsg && <p className="mt-1 text-xs text-stone-500">{uploadMsg}</p>}
        {profile.resumeFileType === 'docx' && (
          <p className="mt-1 text-[11px] text-stone-400">Word files are shown as a close HTML rendering, not a pixel-exact copy.</p>
        )}
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

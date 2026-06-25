import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent } from 'react'
import { useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Mic, Upload, FileAudio, X, RotateCcw, Trash2 } from 'lucide-react'
import { useApiKeys } from '../../context/ApiKeyContext'
import { transcribeLong } from '../../lib/transcribe'
import { reviewInterview } from '../../lib/reviewInterview'
import {
  listSessions,
  getSession,
  saveSession,
  deleteSession,
  type SessionSummary,
} from '../../lib/sessionStore'
import type { InterviewReviewSession } from '../../types'
import ReviewReport from './ReviewReport'
import EmptyState from '../../components/EmptyState'
import { stagger, staggerItem } from '../../lib/ui/motion'

// Record-on-your-phone interview review: upload a full interview recording, transcribe the whole
// call (chunked server-side), grade it (classify round + score), and keep it in history to revisit.
// No live capture — the recording is made off-app; this is the upload + review + grade surface.

type Stage = 'idle' | 'transcribing' | 'grading'

const KIND = 'interview_review'
const MAX_MB = 300

function relativeDate(iso: string): string {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m ago`
  const hr = Math.round(min / 60)
  if (hr < 24) return `${hr}h ago`
  const day = Math.round(hr / 24)
  if (day < 30) return `${day}d ago`
  return new Date(iso).toLocaleDateString()
}

export default function InterviewReviewView({ onNeedKeys }: { onNeedKeys?: () => void }) {
  const { hasOpenai, hasAnthropic, hasDeepgram } = useApiKeys()
  const location = useLocation()

  const [file, setFile] = useState<File | null>(null)
  const [label, setLabel] = useState('')
  const [dragOver, setDragOver] = useState(false)
  const [stage, setStage] = useState<Stage>('idle')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<InterviewReviewSession | null>(null)
  const [history, setHistory] = useState<SessionSummary[]>([])
  const abortRef = useRef<AbortController | null>(null)

  const busy = stage !== 'idle'
  // Transcription needs Deepgram (diarized) OR OpenAI (Whisper fallback); grading needs Anthropic.
  const ready = (hasOpenai || hasDeepgram) && hasAnthropic

  const loadHistory = useCallback(async () => {
    setHistory(await listSessions({ kind: KIND, status: 'completed' }))
  }, [])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  // Opened from History: show that saved review directly.
  useEffect(() => {
    const session = (location.state as { session?: { payload?: InterviewReviewSession } } | null)?.session
    if (session?.payload?.review) setResult(session.payload)
  }, [location.state])

  useEffect(() => () => abortRef.current?.abort(), [])

  function pickFile(f: File | null) {
    setError(null)
    if (!f) return
    if (!f.type.startsWith('audio/') && !f.type.startsWith('video/')) {
      setError('That doesn’t look like an audio or video file.')
      return
    }
    if (f.size > MAX_MB * 1024 * 1024) {
      setError(`That file is over ${MAX_MB} MB. Trim it or export at a lower quality.`)
      return
    }
    setFile(f)
  }

  function onDrop(e: DragEvent<HTMLLabelElement>) {
    e.preventDefault()
    setDragOver(false)
    pickFile(e.dataTransfer.files?.[0] ?? null)
  }

  function onInputChange(e: ChangeEvent<HTMLInputElement>) {
    pickFile(e.target.files?.[0] ?? null)
    e.target.value = ''
  }

  function cancel() {
    abortRef.current?.abort()
    abortRef.current = null
    setStage('idle')
  }

  function reset() {
    setResult(null)
    setFile(null)
    setLabel('')
    setError(null)
  }

  async function run() {
    if (!file) return
    if (!ready) {
      onNeedKeys?.()
      return
    }
    setError(null)
    const controller = new AbortController()
    abortRef.current = controller
    const sessionId = crypto.randomUUID()
    try {
      setStage('transcribing')
      const { transcript, assetId, diarized, utterances } = await transcribeLong(file, {
        sessionId,
        signal: controller.signal,
      })
      if (!transcript.text?.trim()) {
        throw new Error('No speech was found in that recording.')
      }

      setStage('grading')
      const review = await reviewInterview({
        transcript,
        label: label.trim() || null,
        signal: controller.signal,
      })

      const payload: InterviewReviewSession = {
        review,
        transcript,
        assetId,
        label: label.trim() || null,
        durationSec: transcript.durationSec,
        diarized,
        utterances,
        createdAt: Date.now(),
      }
      await saveSession({
        id: sessionId,
        kind: KIND,
        status: 'completed',
        title: payload.label || `${review.roundType.replace(/_/g, ' ')} interview`,
        level: review.grade,
        payload,
      })
      setResult(payload)
      void loadHistory()
    } catch (e) {
      if ((e as Error)?.name === 'AbortError') return
      setError((e as Error)?.message || 'Something went wrong. Please try again.')
    } finally {
      setStage('idle')
      abortRef.current = null
    }
  }

  async function openSaved(row: SessionSummary) {
    const session = await getSession<InterviewReviewSession>(row.id)
    if (session?.payload?.review) {
      setResult(session.payload)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  }

  async function removeSaved(row: SessionSummary, e: React.MouseEvent) {
    e.stopPropagation()
    if (!confirm('Delete this reviewed interview? This cannot be undone.')) return
    await deleteSession(row.id)
    setHistory((prev) => prev.filter((r) => r.id !== row.id))
    if (result && row.id) void loadHistory()
  }

  // ---- Result view --------------------------------------------------------
  if (result) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-serif text-xl font-semibold text-stone-900">Interview review</h2>
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-white"
          >
            <RotateCcw size={14} aria-hidden /> Review another
          </button>
        </div>
        <ReviewReport
          review={result.review}
          durationSec={result.durationSec}
          label={result.label}
          diarized={result.diarized}
        />
      </div>
    )
  }

  // ---- Upload + run view --------------------------------------------------
  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-serif text-xl font-semibold text-stone-900">Interview review</h2>
        <p className="mt-1 max-w-2xl text-sm text-stone-600">
          Record your interview on your phone (Voice Memos on iPhone, Recorder on Android), then drop
          the file here. The whole call is transcribed and graded — round type, a scorecard, and a
          question-by-question breakdown.
        </p>
        <p className="mt-1 text-xs text-stone-400">
          Tip: recording another person can need their consent (some places require it) — a quick “mind
          if I record this for my notes?” keeps you covered.
        </p>
        <p className="mt-1 text-xs text-stone-400">
          {hasDeepgram
            ? 'Speaker separation is on — the transcript will label the interviewer and you separately.'
            : 'Add a Deepgram key in Settings to separate the interviewer’s voice from yours (otherwise the grader infers who’s who).'}
        </p>
      </div>

      {!ready && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This needs a transcription key (Deepgram for speaker separation, or OpenAI) and an Anthropic
          key (grading).{' '}
          <button type="button" onClick={onNeedKeys} className="font-medium underline">
            Open Settings
          </button>
          .
        </div>
      )}

      <motion.div variants={stagger} initial="hidden" animate="show" className="space-y-4">
        <motion.div variants={staggerItem}>
          <label
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed p-8 text-center transition-colors ${
              dragOver ? 'border-terracotta-400 bg-terracotta-50/50' : 'border-stone-300 bg-[#fcfaf6] hover:border-stone-400'
            } ${busy ? 'pointer-events-none opacity-60' : ''}`}
          >
            {file ? (
              <>
                <FileAudio size={28} className="text-terracotta-500" aria-hidden />
                <span className="text-sm font-medium text-stone-800">{file.name}</span>
                <span className="text-xs text-stone-400">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
              </>
            ) : (
              <>
                <Upload size={28} className="text-stone-400" aria-hidden />
                <span className="text-sm font-medium text-stone-700">
                  Drop an interview recording, or click to choose
                </span>
                <span className="text-xs text-stone-400">Audio or video · up to {MAX_MB} MB</span>
              </>
            )}
            <input type="file" accept="audio/*,video/*" className="hidden" onChange={onInputChange} disabled={busy} />
          </label>
        </motion.div>

        <motion.div variants={staggerItem} className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            disabled={busy}
            placeholder="Optional: company / round (e.g. Stripe — backend screen)"
            className="min-w-0 flex-1 rounded-md border border-stone-300 bg-white px-3 py-2 text-sm text-stone-800 placeholder:text-stone-400 disabled:opacity-60"
          />
          {!busy ? (
            <button
              type="button"
              onClick={() => void run()}
              disabled={!file}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-terracotta-600 px-4 py-2 text-sm font-medium text-white hover:bg-terracotta-500 disabled:opacity-50"
            >
              <Mic size={15} aria-hidden /> Transcribe & grade
            </button>
          ) : (
            <button
              type="button"
              onClick={cancel}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              <X size={15} aria-hidden /> Cancel
            </button>
          )}
        </motion.div>

        {busy && (
          <motion.div
            variants={staggerItem}
            className="flex items-center gap-3 rounded-lg border border-stone-200 bg-[#fcfaf6] px-4 py-3 text-sm text-stone-600"
          >
            <span className="h-2 w-2 animate-pulse rounded-full bg-terracotta-500" />
            {stage === 'transcribing'
              ? 'Transcribing the recording… a full interview can take a few minutes.'
              : 'Grading the interview…'}
          </motion.div>
        )}

        {error && (
          <motion.p variants={staggerItem} className="text-sm text-red-600">
            {error}
          </motion.p>
        )}
      </motion.div>

      {/* Past reviews */}
      <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-stone-700">Reviewed interviews</h3>
        {history.length === 0 ? (
          <EmptyState
            className="mt-3"
            icon={<Mic className="h-6 w-6" aria-hidden />}
            title="No reviewed interviews yet"
            description="Upload a recording above and it’ll show up here to revisit. (Durable history needs the backend running.)"
          />
        ) : (
          <ul className="mt-3 space-y-2">
            {history.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => void openSaved(row)}
                  className="group flex w-full items-center justify-between gap-3 rounded-lg border border-stone-200 p-3 text-left transition-colors hover:border-terracotta-300 hover:bg-terracotta-50/40"
                >
                  <div className="min-w-0">
                    <span className="truncate text-sm font-medium text-stone-800">{row.title || 'Interview'}</span>
                    <div className="mt-0.5 text-xs text-stone-400">{relativeDate(row.updated_at)}</div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {row.level && (
                      <span className="grid h-7 w-7 place-items-center rounded-full bg-stone-800 text-xs font-semibold text-white">
                        {row.level}
                      </span>
                    )}
                    <span
                      onClick={(e) => removeSaved(row, e)}
                      role="button"
                      tabIndex={0}
                      aria-label="Delete reviewed interview"
                      className="grid h-7 w-7 place-items-center rounded text-stone-400 transition-colors hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 size={14} aria-hidden />
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

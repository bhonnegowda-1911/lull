import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import { useApiKeys } from '../../context/ApiKeyContext'
import { transcribe } from '../../lib/transcribe'

// Voice answers in a system-design turn are transient (transcribed into the textarea, not kept
// as a recording), so we don't store them as assets — only the transcript text is used.

// Text + voice composer for one conversation turn. The candidate can type, or push-to-talk:
// recording stops -> Whisper transcribes -> text is appended to the textarea so they can
// edit before sending. Voice and text are one merged answer (not two channels).

interface AnswerComposerProps {
  onSubmit: (text: string) => void
  disabled?: boolean
  placeholder?: string
}

export default function AnswerComposer({ onSubmit, disabled, placeholder }: AnswerComposerProps) {
  const { hasOpenai } = useApiKeys()
  const [text, setText] = useState('')
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)

  useEffect(() => {
    return () => stopStream()
  }, [])

  function stopStream() {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop())
      streamRef.current = null
    }
  }

  async function startRecording() {
    setError(null)
    if (!hasOpenai) {
      setError('OpenAI transcription isn’t configured on the server (see Settings).')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const recorder = new MediaRecorder(stream)
      chunksRef.current = []
      recorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
      }
      recorder.onstop = handleStopped
      recorderRef.current = recorder
      startedAtRef.current = performance.now()
      recorder.start()
      setRecording(true)
    } catch (e) {
      setError(
        (e as Error)?.name === 'NotAllowedError'
          ? 'Microphone permission denied.'
          : 'Could not start recording. Check your mic.',
      )
      stopStream()
    }
  }

  function stopRecording() {
    setRecording(false)
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop()
    }
  }

  async function handleStopped() {
    const durationSec = (performance.now() - startedAtRef.current) / 1000
    const blob = new Blob(chunksRef.current, { type: recorderRef.current?.mimeType || 'audio/webm' })
    stopStream()
    setTranscribing(true)
    setError(null)
    try {
      const { transcript } = await transcribe(blob, { fallbackDurationSec: durationSec })
      const spoken = (transcript.text || '').trim()
      if (spoken) setText((prev) => (prev ? `${prev} ${spoken}` : spoken))
      else setError('No speech detected. Try again or type your answer.')
    } catch (e) {
      setError((e as Error)?.message || 'Transcription failed.')
    } finally {
      setTranscribing(false)
    }
  }

  function handleSend() {
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSubmit(trimmed)
    setText('')
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Cmd/Ctrl+Enter sends, like most chat composers.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault()
      handleSend()
    }
  }

  const busy = disabled || transcribing

  return (
    <div className="rounded-xl border border-stone-200/80 bg-[#fcfaf6] p-3 shadow-sm">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        disabled={busy}
        rows={3}
        placeholder={placeholder || 'Type your answer, or use the mic…'}
        className="w-full resize-y rounded-md border border-stone-200 p-2.5 text-sm text-stone-800 placeholder:text-stone-400 focus:border-terracotta-400 focus:outline-none focus:ring-1 focus:ring-terracotta-400 disabled:bg-stone-50"
      />
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      <div className="mt-2 flex items-center gap-2">
        {!recording ? (
          <button
            type="button"
            onClick={startRecording}
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
          >
            <span className="h-2 w-2 rounded-full bg-red-500" />
            {transcribing ? 'Transcribing…' : 'Hold the mic'}
          </button>
        ) : (
          <button
            type="button"
            onClick={stopRecording}
            className="inline-flex items-center gap-1.5 rounded-md bg-stone-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
          >
            <span className="h-2 w-2 bg-white" /> Stop & transcribe
          </button>
        )}
        <button
          type="button"
          onClick={handleSend}
          disabled={busy || !text.trim()}
          className="ml-auto rounded-md bg-terracotta-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-terracotta-500 disabled:opacity-50"
        >
          Send
        </button>
      </div>
      <p className="mt-1 text-right text-[11px] text-stone-400">⌘/Ctrl + Enter to send</p>
    </div>
  )
}

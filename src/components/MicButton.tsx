import { useEffect, useRef, useState } from 'react'
import { useApiKeys } from '../context/ApiKeyContext'
import { transcribe } from '../lib/transcribe'

// Compact push-to-talk button: records mic audio, transcribes it via the Whisper gateway, and
// hands the text back through onTranscript so the caller can drop it into whatever field is being
// filled. Callers render their own error line and can use onBusyChange to disable adjacent inputs
// while recording/transcribing. The transcribe gateway always stores the original take; callers
// that want to keep it (replay / scoring) pass onClip + sessionId, otherwise the asset is unused.

/** A captured voice take: stored recording + its spoken length and transcript. */
export interface MicClip {
  assetId: string
  durationSec: number | null
  text: string
}

interface MicButtonProps {
  onTranscript: (text: string) => void
  onError?: (message: string) => void
  onBusyChange?: (busy: boolean) => void
  disabled?: boolean
  /** Session to link the stored recording to. */
  sessionId?: string
  /** Called once per recorded take with the stored recording, for replay + delivery scoring. */
  onClip?: (clip: MicClip) => void
}

export default function MicButton({ onTranscript, onError, onBusyChange, disabled, sessionId, onClip }: MicButtonProps) {
  const { hasOpenai } = useApiKeys()
  const [recording, setRecording] = useState(false)
  const [transcribing, setTranscribing] = useState(false)

  const recorderRef = useRef<MediaRecorder | null>(null)
  const streamRef = useRef<MediaStream | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const startedAtRef = useRef(0)

  // Let the parent disable adjacent inputs while a take is in flight.
  useEffect(() => {
    onBusyChange?.(recording || transcribing)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recording, transcribing])

  // Release the mic if the parent unmounts mid-recording.
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
    if (!hasOpenai) {
      onError?.('OpenAI transcription isn’t configured on the server (see Settings).')
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
      onError?.(
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
    try {
      const { transcript, assetId } = await transcribe(blob, { fallbackDurationSec: durationSec, sessionId })
      const spoken = (transcript.text || '').trim()
      if (spoken) {
        onTranscript(spoken)
        if (assetId) onClip?.({ assetId, durationSec: transcript.durationSec ?? durationSec, text: spoken })
      } else onError?.('No speech detected. Try again or type your answer.')
    } catch (e) {
      onError?.((e as Error)?.message || 'Transcription failed.')
    } finally {
      setTranscribing(false)
    }
  }

  return !recording ? (
    <button
      type="button"
      onClick={() => void startRecording()}
      disabled={disabled || transcribing}
      title="Record your answer"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-stone-300 px-2.5 py-1.5 text-sm font-medium text-stone-700 hover:bg-white disabled:opacity-50"
    >
      <span className="h-2 w-2 rounded-full bg-red-500" />
      {transcribing ? 'Transcribing…' : 'Mic'}
    </button>
  ) : (
    <button
      type="button"
      onClick={stopRecording}
      title="Stop and transcribe"
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-stone-800 px-2.5 py-1.5 text-sm font-medium text-white hover:bg-stone-700"
    >
      <span className="h-2 w-2 bg-white" /> Stop
    </button>
  )
}

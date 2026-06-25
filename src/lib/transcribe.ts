import type { Transcript } from '../types'

// Transcribe an audio OR video blob via the backend gateway (`/api/llm/transcribe`), which
// holds the OpenAI key, stores the original recording in object storage, and returns both the
// transcript and the stored recording's asset id. Whisper extracts audio from video
// server-side, so the same path satisfies "voice or video".

import { API_BASE as BASE } from './api'
import { getOpenaiKey, getDeepgramKey } from './userKeys'
import type { DiarizedUtterance } from '../types'
const MAX_BYTES = 25 * 1024 * 1024 // Whisper request limit

export type TranscribeErrorCode = 'no_key' | 'too_large' | 'network' | 'auth' | 'quota' | 'rate' | 'http'

export class TranscribeError extends Error {
  code?: TranscribeErrorCode
  constructor(message: string, { code }: { code?: TranscribeErrorCode } = {}) {
    super(message)
    this.name = 'TranscribeError'
    this.code = code
  }
}

function filenameFor(blob: Blob): string {
  const type = blob.type || ''
  if (type.includes('webm')) return 'answer.webm'
  if (type.includes('mp4')) return 'answer.mp4'
  if (type.includes('mpeg') || type.includes('mp3')) return 'answer.mp3'
  if (type.includes('wav')) return 'answer.wav'
  if (type.includes('ogg')) return 'answer.ogg'
  if (type.startsWith('video/')) return 'answer.mp4'
  return 'answer.webm'
}

export interface TranscribeOptions {
  signal?: AbortSignal
  fallbackDurationSec?: number | null
  /** Optionally link the stored recording to a session. */
  sessionId?: string
}

export interface TranscribeResult {
  transcript: Transcript
  /** Asset id of the stored original recording, or null if storage was unavailable. */
  assetId: string | null
}

export async function transcribe(
  blob: Blob,
  { signal, fallbackDurationSec, sessionId }: TranscribeOptions = {},
): Promise<TranscribeResult> {
  if (blob.size > MAX_BYTES) {
    throw new TranscribeError(
      'Recording is over the 25 MB transcription limit. Use Audio mode or a shorter take.',
      { code: 'too_large' },
    )
  }

  const form = new FormData()
  form.append('file', blob, filenameFor(blob))
  if (fallbackDurationSec != null) form.append('fallbackDurationSec', String(fallbackDurationSec))
  if (sessionId) form.append('sessionId', sessionId)

  // BYOK: send the user's own OpenAI key (held only in this browser) per request. FormData sets
  // its own content-type, so we only add the key header. Omitted when unset (env fallback).
  const headers: Record<string, string> = {}
  const userKey = getOpenaiKey()
  if (userKey) headers['x-openai-key'] = userKey

  let res: Response
  try {
    res = await fetch(`${BASE}/api/llm/transcribe`, { method: 'POST', headers, body: form, signal })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new TranscribeError('Network error reaching the transcription service.', { code: 'network' })
  }

  if (!res.ok) {
    let message = `Transcription failed (${res.status}).`
    try {
      const err = (await res.json()) as { error?: string }
      if (err?.error) message = err.error
    } catch {
      // non-JSON error body
    }
    const code: TranscribeErrorCode =
      res.status === 503 ? 'no_key' : res.status === 401 ? 'auth' : res.status === 429 ? 'rate' : 'http'
    throw new TranscribeError(message, { code })
  }

  const data = (await res.json()) as { transcript: Transcript; assetId: string | null }
  return { transcript: data.transcript, assetId: data.assetId ?? null }
}

// Long-form transcription for a full interview recording (phone capture, 45–90 min). The backend
// re-encodes and time-slices the file with ffmpeg, transcribes each chunk via Whisper, and stitches
// one transcript — so the only client-side cap is the upload size, not Whisper's 25 MB per-request
// limit. `segments` carries each chunk's start time + text for an optional timeline view.
const MAX_LONG_BYTES = 300 * 1024 * 1024

export interface TranscriptSegment {
  index: number
  startSec: number
  durationSec: number
  text: string
}

export interface LongTranscribeResult extends TranscribeResult {
  segments: TranscriptSegment[]
  /** True when the transcript carries speaker labels (Deepgram diarization ran). */
  diarized: boolean
  /** Per-turn diarized transcript, when available. */
  utterances: DiarizedUtterance[]
}

export async function transcribeLong(
  blob: Blob,
  { signal, sessionId }: TranscribeOptions = {},
): Promise<LongTranscribeResult> {
  if (blob.size > MAX_LONG_BYTES) {
    throw new TranscribeError(
      'Recording is over the 300 MB upload limit. Trim it or export at a lower quality.',
      { code: 'too_large' },
    )
  }

  const form = new FormData()
  form.append('file', blob, filenameFor(blob))
  if (sessionId) form.append('sessionId', sessionId)

  // BYOK: send whichever transcription keys the user holds. A Deepgram key turns on diarized
  // (speaker-separated) transcription server-side; OpenAI is the non-diarized fallback.
  const headers: Record<string, string> = {}
  const userKey = getOpenaiKey()
  if (userKey) headers['x-openai-key'] = userKey
  const deepgramKey = getDeepgramKey()
  if (deepgramKey) headers['x-deepgram-key'] = deepgramKey

  let res: Response
  try {
    res = await fetch(`${BASE}/api/llm/transcribe-long`, { method: 'POST', headers, body: form, signal })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new TranscribeError('Network error reaching the transcription service.', { code: 'network' })
  }

  if (!res.ok) {
    let message = `Transcription failed (${res.status}).`
    try {
      const err = (await res.json()) as { error?: string }
      if (err?.error) message = err.error
    } catch {
      // non-JSON error body
    }
    const code: TranscribeErrorCode =
      res.status === 503 ? 'no_key' : res.status === 401 ? 'auth' : res.status === 429 ? 'rate' : 'http'
    throw new TranscribeError(message, { code })
  }

  const data = (await res.json()) as {
    transcript: Transcript
    assetId: string | null
    segments?: TranscriptSegment[]
    diarized?: boolean
    utterances?: DiarizedUtterance[]
  }
  return {
    transcript: data.transcript,
    assetId: data.assetId ?? null,
    segments: data.segments ?? [],
    diarized: data.diarized ?? false,
    utterances: data.utterances ?? [],
  }
}

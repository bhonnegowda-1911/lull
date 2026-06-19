// Transcribe an audio OR video blob via OpenAI Whisper. Whisper extracts audio from
// video server-side, so the same endpoint satisfies "voice or video" with no client work.

const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions'
const MAX_BYTES = 25 * 1024 * 1024 // Whisper request limit

export class TranscribeError extends Error {
  constructor(message, { code } = {}) {
    super(message)
    this.name = 'TranscribeError'
    this.code = code
  }
}

function filenameFor(blob) {
  const type = blob.type || ''
  if (type.includes('webm')) return 'answer.webm'
  if (type.includes('mp4')) return 'answer.mp4'
  if (type.includes('mpeg') || type.includes('mp3')) return 'answer.mp3'
  if (type.includes('wav')) return 'answer.wav'
  if (type.includes('ogg')) return 'answer.ogg'
  if (type.startsWith('video/')) return 'answer.mp4'
  return 'answer.webm'
}

/**
 * @param {Blob} blob
 * @param {{ apiKey: string, signal?: AbortSignal, fallbackDurationSec?: number }} opts
 * @returns {Promise<{ text: string, words?: Array, durationSec: number | null }>}
 */
export async function transcribe(blob, { apiKey, signal, fallbackDurationSec } = {}) {
  if (!apiKey) throw new TranscribeError('Missing OpenAI API key.', { code: 'no_key' })
  if (blob.size > MAX_BYTES) {
    throw new TranscribeError(
      'Recording is over the 25 MB transcription limit. Use Audio mode or a shorter take.',
      { code: 'too_large' },
    )
  }

  const form = new FormData()
  form.append('file', blob, filenameFor(blob))
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')

  let res
  try {
    res = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
      signal,
    })
  } catch (e) {
    if (e?.name === 'AbortError') throw e
    throw new TranscribeError('Network error reaching the transcription service.', {
      code: 'network',
    })
  }

  if (!res.ok) {
    // OpenAI returns a JSON error body with a machine-readable code/type — read it so we
    // can tell "no credits" (insufficient_quota) apart from genuine rate limiting.
    let apiErr = null
    try {
      apiErr = (await res.json())?.error || null
    } catch {
      // non-JSON error body — fall through to status-based messages
    }
    const apiCode = apiErr?.code || apiErr?.type
    const apiMsg = apiErr?.message

    if (res.status === 401) throw new TranscribeError('Invalid OpenAI API key.', { code: 'auth' })
    if (res.status === 413 || apiCode === 'file_too_large')
      throw new TranscribeError('Recording too large for transcription. Try a shorter take.', {
        code: 'too_large',
      })
    if (res.status === 429) {
      if (apiCode === 'insufficient_quota')
        throw new TranscribeError(
          'OpenAI reports no remaining quota on this key. The Whisper API is paid — add a ' +
            'payment method or credits at platform.openai.com (Settings → Billing), then retry.',
          { code: 'quota' },
        )
      throw new TranscribeError('OpenAI rate limit hit. Wait a few seconds and retry.', {
        code: 'rate',
      })
    }
    throw new TranscribeError(
      apiMsg ? `Transcription failed (${res.status}): ${apiMsg}` : `Transcription failed (${res.status}).`,
      { code: 'http' },
    )
  }

  const data = await res.json()
  const durationSec =
    typeof data.duration === 'number' && data.duration > 0
      ? data.duration
      : fallbackDurationSec ?? null

  return {
    text: (data.text || '').trim(),
    words: data.words,
    durationSec,
  }
}

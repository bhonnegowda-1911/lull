import { Router } from 'express'
import type { Request as ExpressRequest, Response as ExpressResponse } from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
import { spawn } from 'node:child_process'
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ffmpegPath from 'ffmpeg-static'
import { pool } from '../db.js'
import { putObject } from '../storage.js'

// LLM gateway. All model access goes through here so provider API keys live only in the
// server's environment (never the browser), and so prompts/usage have one chokepoint for
// future cost tracking. Prompt + schema construction still happens client-side for now; this
// just forwards. Mirrors the contracts the frontend's llmClient/transcribe used to call
// directly (Anthropic Messages with json_schema output; OpenAI Whisper verbose_json).

export const llm = Router()

const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_VERSION = '2023-06-01'
const WHISPER_URL = 'https://api.openai.com/v1/audio/transcriptions'
const DEEPGRAM_URL = 'https://api.deepgram.com/v1/listen'

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''
const OPENAI_KEY = process.env.OPENAI_API_KEY || ''
const DEEPGRAM_KEY = process.env.DEEPGRAM_API_KEY || ''

export function providerStatus() {
  return { anthropic: Boolean(ANTHROPIC_KEY), openai: Boolean(OPENAI_KEY), deepgram: Boolean(DEEPGRAM_KEY) }
}

// Transient upstream failures we ride out with backoff rather than surfacing to the user. 529 is
// Anthropic's "Overloaded"; 5xx and 429 are momentary saturation/rate. The request itself is fine.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529])
// Ride out a sustained overload: 6 attempts with backoff capped at 8s (~0.7,1.4,2.8,5.6,8s of waits,
// plus jitter) before surfacing the error. Heavier calls (e.g. the prep plan) hit 529 more often.
const MAX_RETRIES = 6
const MAX_BACKOFF_MS = 8000
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** POST to Anthropic, retrying transient errors with exponential backoff + jitter (honoring
 *  Retry-After when given). Returns the final Response; the caller handles non-ok statuses. */
async function postAnthropicWithRetry(body: unknown, apiKey: string): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let upstream: Response | null = null
    try {
      upstream = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': ANTHROPIC_VERSION,
        },
        body: JSON.stringify(body),
      })
    } catch (e) {
      if (attempt >= MAX_RETRIES) throw e // network error, out of retries
    }
    if (upstream && (upstream.ok || !RETRYABLE_STATUS.has(upstream.status) || attempt >= MAX_RETRIES)) {
      return upstream
    }
    const retryAfter = upstream ? Number(upstream.headers.get('retry-after')) : NaN
    upstream?.body?.cancel().catch(() => {}) // free the connection before retrying
    const backoff = Math.min(700 * 2 ** attempt, MAX_BACKOFF_MS) + Math.floor(Math.random() * 400)
    const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : backoff
    console.warn(`[llm] transient upstream ${upstream?.status ?? 'network'}; retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_RETRIES})`)
    await sleep(waitMs)
  }
}

interface ChatBody {
  provider?: string
  model: string
  system: string
  user: string
  /**
   * Stable, reused leading portion of the user turn (e.g. an interview's prior transcript). Sent as
   * its own text block with a cache_control breakpoint, so the cached prefix spans system + this
   * block — turns after the first within a stage re-read it at ~0.1x input cost instead of full
   * price. The cache only writes once the prefix clears the model's minimum (4096 tokens on Opus
   * 4.8), so short early turns are a harmless no-op. Keep the volatile latest message in `user`.
   */
  cachePrefix?: string
  /** Optional base64 PNG images (no data: prefix) attached to the user turn as vision blocks. */
  images?: string[]
  schema: Record<string, unknown>
  maxTokens?: number
  temperature?: number
  thinking?: 'adaptive'
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

// Build the user-turn content. A plain string when there's nothing special; otherwise a content-block
// array: an optional cached prefix block (cache_control breakpoint), then the volatile latest message,
// then one image block per attachment (Anthropic vision format). Images live AFTER the breakpoint so a
// changing whiteboard never invalidates the cached prefix.
function userContent(b: ChatBody): unknown {
  const images = (b.images || []).filter((d) => typeof d === 'string' && d.length > 0)
  const prefix = (b.cachePrefix || '').trim()
  if (!images.length && !prefix) return b.user
  const blocks: unknown[] = []
  if (prefix) blocks.push({ type: 'text', text: b.cachePrefix, cache_control: { type: 'ephemeral' } })
  blocks.push({ type: 'text', text: b.user })
  for (const data of images) {
    blocks.push({ type: 'image', source: { type: 'base64', media_type: 'image/png', data } })
  }
  return blocks
}

// Assemble the Anthropic Messages request body from a ChatBody. Shared by the blocking and streaming
// routes so both send an identical payload (the stream route just adds `stream: true`).
function buildChatRequest(b: ChatBody): Record<string, unknown> {
  const outputConfig: Record<string, unknown> = { format: { type: 'json_schema', schema: b.schema } }
  if (b.effort) outputConfig.effort = b.effort
  const body: Record<string, unknown> = {
    model: b.model,
    max_tokens: b.maxTokens ?? 1500,
    system: b.system,
    messages: [{ role: 'user', content: userContent(b) }],
    output_config: outputConfig,
  }
  if (typeof b.temperature === 'number') body.temperature = b.temperature
  if (b.thinking) body.thinking = { type: b.thinking }
  return body
}

interface AnthropicMessage {
  content?: Array<{ type: string; text?: string }>
  stop_reason?: string
  usage?: unknown
}

// Apply the terminal checks to a completed (or assembled-from-stream) Anthropic response and extract
// the parsed JSON. Returns either the parsed value or an error + HTTP status. Shared so the blocking
// and streaming routes surface the exact same failure semantics.
function finalizeChatData(data: AnthropicMessage): { parsed: unknown } | { error: string; status: number } {
  if (data.stop_reason === 'refusal') {
    return { error: 'The model declined to analyze this content.', status: 422 }
  }
  // Truncation produces incomplete JSON that then fails to parse — surface the real cause (the length
  // limit) with an actionable message. The caller's maxTokens budget is too small; raising it is the fix.
  if (data.stop_reason === 'max_tokens') {
    return { error: 'The analysis was cut off before it finished (hit the length limit). Please try again.', status: 502 }
  }
  const textBlock = (data.content || []).find((c) => c.type === 'text')
  if (!textBlock?.text) return { error: 'Empty analysis response.', status: 502 }
  try {
    return { parsed: JSON.parse(textBlock.text) }
  } catch {
    return { error: 'Could not parse the analysis response.', status: 502 }
  }
}

// Anthropic key (BYOK per request, env fallback) or the JSON error response to send. Never logs the key.
function resolveKeyOrReject(req: ExpressRequest, res: ExpressResponse): string | null {
  if ((req.body?.provider ?? 'anthropic') !== 'anthropic') {
    res.status(400).json({ error: 'Only the anthropic provider is implemented.' })
    return null
  }
  const apiKey = (req.header('x-anthropic-key') || ANTHROPIC_KEY).trim()
  if (!apiKey) {
    res.status(503).json({ error: 'No Anthropic API key. Add yours in Settings, or set one on the server.' })
    return null
  }
  return apiKey
}

// Build the JSON error message for a non-ok upstream (shared by both routes; sent as JSON pre-stream).
function upstreamErrorMessage(status: number, detail: string): string {
  // Still overloaded/saturated after retries — tell the user it's transient and to retry.
  if (RETRYABLE_STATUS.has(status)) {
    return `Anthropic is temporarily overloaded (${status})${detail}. Please try again in a moment.`
  }
  return `Analysis failed (${status})${detail}.`
}

async function upstreamErrorDetail(upstream: Response): Promise<string> {
  try {
    const err = (await upstream.json()) as { error?: { message?: string } }
    return err?.error?.message ? `: ${err.error.message}` : ''
  } catch {
    return ''
  }
}

// POST /api/llm/chat → { parsed, raw }
llm.post('/chat', async (req, res) => {
  const apiKey = resolveKeyOrReject(req, res)
  if (!apiKey) return
  const b = req.body as ChatBody

  let upstream: Response
  try {
    upstream = await postAnthropicWithRetry(buildChatRequest(b), apiKey)
  } catch {
    return res.status(502).json({ error: 'Network error reaching Anthropic.' })
  }

  if (!upstream.ok) {
    return res.status(upstream.status).json({ error: upstreamErrorMessage(upstream.status, await upstreamErrorDetail(upstream)) })
  }

  const data = (await upstream.json()) as AnthropicMessage
  const fin = finalizeChatData(data)
  if ('error' in fin) return res.status(fin.status).json({ error: fin.error })
  if (data.usage) console.log('[llm] chat usage', b.model, JSON.stringify(data.usage))
  res.json({ parsed: fin.parsed, raw: data })
})

// Write one Server-Sent Event frame.
function sse(res: { write(chunk: string): boolean }, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

interface AnthropicStreamEvent {
  type?: string
  content_block?: { type?: string }
  delta?: { type?: string; text?: string; stop_reason?: string }
  usage?: unknown
  error?: { message?: string }
}

// POST /api/llm/chat/stream → Server-Sent Events: `phase` (thinking|writing), `text` (JSON deltas),
// `done` ({ parsed, raw }), `error` ({ message }). Same request body and failure semantics as /chat;
// callers that don't need progressive output keep using /chat. Pre-stream failures (bad provider, no
// key, upstream non-ok) are still returned as ordinary JSON — we only switch to SSE once bytes flow.
llm.post('/chat/stream', async (req, res) => {
  const apiKey = resolveKeyOrReject(req, res)
  if (!apiKey) return
  const b = req.body as ChatBody

  let upstream: Response
  try {
    upstream = await postAnthropicWithRetry({ ...buildChatRequest(b), stream: true }, apiKey)
  } catch {
    return res.status(502).json({ error: 'Network error reaching Anthropic.' })
  }
  if (!upstream.ok) {
    return res.status(upstream.status).json({ error: upstreamErrorMessage(upstream.status, await upstreamErrorDetail(upstream)) })
  }
  const reader = upstream.body?.getReader()
  if (!reader) return res.status(502).json({ error: 'Empty analysis response.' })

  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.flushHeaders?.()

  // Cancel the upstream read if the browser disconnects (e.g. the user hit "Start over").
  let aborted = false
  req.on('close', () => {
    aborted = true
    reader.cancel().catch(() => {})
  })

  const decoder = new TextDecoder()
  let buf = ''
  let jsonText = ''
  let phase: 'thinking' | 'writing' | null = null
  let stopReason: string | undefined
  let usage: unknown

  const handleBlock = (block: string) => {
    const dataLine = block.split('\n').find((l) => l.startsWith('data:'))
    if (!dataLine) return
    let evt: AnthropicStreamEvent
    try {
      evt = JSON.parse(dataLine.slice(5).trim())
    } catch {
      return
    }
    switch (evt.type) {
      case 'content_block_start': {
        const p = evt.content_block?.type === 'text' ? 'writing' : 'thinking'
        if (p !== phase) {
          phase = p
          sse(res, 'phase', { phase: p })
        }
        break
      }
      case 'content_block_delta': {
        if (evt.delta?.type === 'text_delta' && typeof evt.delta.text === 'string') {
          jsonText += evt.delta.text
          sse(res, 'text', { text: evt.delta.text })
        }
        break
      }
      case 'message_delta': {
        if (evt.delta?.stop_reason) stopReason = evt.delta.stop_reason
        if (evt.usage) usage = evt.usage
        break
      }
      case 'error':
        sse(res, 'error', { message: evt.error?.message || 'Analysis stream failed.' })
        break
    }
  }

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        handleBlock(buf.slice(0, idx))
        buf = buf.slice(idx + 2)
      }
    }
  } catch {
    if (!aborted) sse(res, 'error', { message: 'Analysis stream interrupted.' })
    return res.end()
  }
  if (aborted) return res.end()

  const data: AnthropicMessage = { content: [{ type: 'text', text: jsonText }], stop_reason: stopReason, usage }
  const fin = finalizeChatData(data)
  if ('error' in fin) {
    sse(res, 'error', { message: fin.error })
    return res.end()
  }
  if (usage) console.log('[llm] chat(stream) usage', b.model, JSON.stringify(usage))
  sse(res, 'done', { parsed: fin.parsed, raw: data })
  res.end()
})

interface WhisperWord {
  word: string
  start: number
  end: number
}
interface WhisperResult {
  text: string
  words: WhisperWord[]
  duration: number | null
}

/** Raised when Whisper rejects a chunk; carries the upstream status so the route can echo it. */
class WhisperError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/** POST one audio buffer to Whisper (verbose_json + word timestamps) and return its parsed result. */
async function whisperTranscribe(
  buffer: Buffer,
  mimetype: string,
  filename: string,
  openaiKey: string,
): Promise<WhisperResult> {
  const form = new FormData()
  form.append('file', new Blob([buffer], { type: mimetype }), filename)
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')

  let upstream: Response
  try {
    upstream = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${openaiKey}` },
      body: form,
    })
  } catch {
    throw new WhisperError('Network error reaching the transcription service.', 502)
  }
  if (!upstream.ok) {
    let msg = ''
    try {
      msg = ((await upstream.json()) as { error?: { message?: string } })?.error?.message || ''
    } catch {
      /* ignore */
    }
    throw new WhisperError(msg || `Transcription failed (${upstream.status}).`, upstream.status)
  }
  const data = (await upstream.json()) as { text?: string; words?: WhisperWord[]; duration?: number }
  return {
    text: (data.text || '').trim(),
    words: Array.isArray(data.words) ? data.words : [],
    duration: typeof data.duration === 'number' && data.duration > 0 ? data.duration : null,
  }
}

interface DiarizedUtterance {
  speaker: number
  start: number
  end: number
  text: string
}
interface DiarizedResult {
  /** Speaker-labeled transcript text ("Speaker 0: …\nSpeaker 1: …") for the grader to read. */
  text: string
  words: Array<WhisperWord & { speaker?: number }>
  durationSec: number | null
  utterances: DiarizedUtterance[]
}

// Deepgram's prerecorded API. Unlike Whisper, it diarizes (per-word speaker labels) and ingests a
// whole long file in one request — so the review path uses it when a Deepgram key is present and
// skips the ffmpeg chunking entirely. We turn its utterances into a "Speaker N:" labeled transcript
// so the downstream grader can tell the interviewer from the candidate.
async function deepgramTranscribe(buffer: Buffer, mimetype: string, key: string): Promise<DiarizedResult> {
  const params = new URLSearchParams({
    model: 'nova-2',
    diarize: 'true',
    punctuate: 'true',
    smart_format: 'true',
    utterances: 'true',
  })
  let upstream: Response
  try {
    upstream = await fetch(`${DEEPGRAM_URL}?${params}`, {
      method: 'POST',
      headers: { Authorization: `Token ${key}`, 'Content-Type': mimetype || 'audio/mpeg' },
      body: buffer,
    })
  } catch {
    throw new WhisperError('Network error reaching Deepgram.', 502)
  }
  if (!upstream.ok) {
    let msg = ''
    try {
      msg = ((await upstream.json()) as { err_msg?: string; reason?: string })?.err_msg || ''
    } catch {
      /* ignore */
    }
    throw new WhisperError(msg || `Diarized transcription failed (${upstream.status}).`, upstream.status)
  }
  const data = (await upstream.json()) as {
    results?: {
      channels?: Array<{ alternatives?: Array<{ transcript?: string; words?: Array<{ word: string; punctuated_word?: string; start: number; end: number; speaker?: number }> }> }>
      utterances?: Array<{ speaker?: number; start: number; end: number; transcript: string }>
    }
    metadata?: { duration?: number }
  }
  const alt = data.results?.channels?.[0]?.alternatives?.[0]
  const utts: DiarizedUtterance[] = (data.results?.utterances || []).map((u) => ({
    speaker: u.speaker ?? 0,
    start: u.start,
    end: u.end,
    text: u.transcript,
  }))
  // Merge consecutive same-speaker utterances into labeled lines.
  const lines: string[] = []
  let curSpeaker = -1
  for (const u of utts) {
    if (u.speaker === curSpeaker) lines[lines.length - 1] += ' ' + u.text
    else {
      curSpeaker = u.speaker
      lines.push(`Speaker ${u.speaker}: ${u.text}`)
    }
  }
  const words = (alt?.words || []).map((w) => ({
    word: w.punctuated_word || w.word,
    start: w.start,
    end: w.end,
    speaker: w.speaker,
  }))
  return {
    text: lines.join('\n') || (alt?.transcript || '').trim(),
    words,
    durationSec: typeof data.metadata?.duration === 'number' && data.metadata.duration > 0 ? data.metadata.duration : null,
    utterances: utts,
  }
}

/** Persist the original uploaded recording as an asset. Best-effort: storage failure returns null
 *  rather than blocking transcription (the transcript is the product; the recording is a bonus). */
async function storeRecordingAsset(
  file: Express.Multer.File,
  sessionId: string | null,
  userId: string | undefined,
): Promise<string | null> {
  const assetId = randomUUID()
  const kind = file.mimetype.startsWith('video/') ? 'video' : 'audio'
  const objectKey = `${kind}/${assetId}`
  try {
    await putObject(objectKey, file.buffer, file.mimetype)
    await pool.query(
      `INSERT INTO assets (id, user_id, session_id, kind, object_key, content_type, size_bytes, original_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [assetId, userId, sessionId, kind, objectKey, file.mimetype, file.size, file.originalname || null],
    )
    return assetId
  } catch (e) {
    console.error('[llm] failed to store recording', e)
    return null
  }
}

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

// POST /api/llm/transcribe (multipart: file, optional sessionId) → { transcript, assetId }
// Stores the original recording in MinIO (the user wants it kept) AND transcribes it. Single-shot:
// for short takes only (the 25 MB Whisper limit). Long interviews go through /transcribe-long.
llm.post('/transcribe', upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) return res.status(400).json({ error: 'file is required' })
  // BYOK: user's own key per request, env key as fallback. Never logged.
  const openaiKey = (req.header('x-openai-key') || OPENAI_KEY).trim()
  if (!openaiKey) {
    return res.status(503).json({ error: 'No OpenAI API key. Add yours in Settings, or set one on the server.' })
  }

  const sessionId = req.body.sessionId ? String(req.body.sessionId) : null
  const assetId = await storeRecordingAsset(file, sessionId, req.userId)

  let result: WhisperResult
  try {
    result = await whisperTranscribe(file.buffer, file.mimetype, file.originalname || 'answer.webm', openaiKey)
  } catch (e) {
    const err = e as WhisperError
    return res.status(err.status || 502).json({ error: err.message })
  }
  const fallback = req.body.fallbackDurationSec ? Number(req.body.fallbackDurationSec) : null
  const transcript = {
    text: result.text,
    words: result.words,
    durationSec: result.duration ?? fallback,
  }
  res.json({ transcript, assetId })
})

// Long-form transcription. A full interview recorded on a phone (45–90 min, tens of MB) blows past
// Whisper's 25 MB / single-request limit, so we re-encode to mono 16 kHz MP3 and time-slice into
// SEGMENT_SEC chunks with ffmpeg, transcribe each chunk, then stitch the text and word timings (with
// per-chunk offsets) back into one transcript. The original upload is still kept as one asset.
const SEGMENT_SEC = 600 // 10-min chunks: ~3.6 MB each at mono/16 kHz/48 kbps, well under the limit
const longUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 300 * 1024 * 1024 } })

/** Run the bundled static ffmpeg with the given args; resolve on exit 0, reject with stderr tail. */
function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!ffmpegPath) return reject(new Error('ffmpeg binary unavailable'))
    const proc = spawn(ffmpegPath, args, { stdio: ['ignore', 'ignore', 'pipe'] })
    let stderr = ''
    proc.stderr.on('data', (d) => {
      stderr += d.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`)),
    )
  })
}

interface TranscriptSegment {
  index: number
  startSec: number
  durationSec: number
  text: string
}

// POST /api/llm/transcribe-long (multipart: file, optional sessionId)
//   → { transcript, assetId, segments, diarized, utterances }
// Prefers Deepgram (diarized, whole-file) when a Deepgram key is available; otherwise falls back to
// Whisper with ffmpeg chunking (no speaker labels). Either key alone is enough to transcribe.
llm.post('/transcribe-long', longUpload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) return res.status(400).json({ error: 'file is required' })
  const deepgramKey = (req.header('x-deepgram-key') || DEEPGRAM_KEY).trim()
  const openaiKey = (req.header('x-openai-key') || OPENAI_KEY).trim()
  if (!deepgramKey && !openaiKey) {
    return res.status(503).json({
      error: 'No transcription key. Add a Deepgram key (speaker separation) or an OpenAI key in Settings.',
    })
  }

  const sessionId = req.body.sessionId ? String(req.body.sessionId) : null
  const assetId = await storeRecordingAsset(file, sessionId, req.userId)

  // 1) Deepgram path — diarized, single request, no chunking.
  if (deepgramKey) {
    try {
      const dg = await deepgramTranscribe(file.buffer, file.mimetype, deepgramKey)
      return res.json({
        transcript: { text: dg.text, words: dg.words, durationSec: dg.durationSec },
        assetId,
        segments: [],
        diarized: true,
        utterances: dg.utterances,
      })
    } catch (e) {
      const err = e as WhisperError
      // With no Whisper fallback available, surface Deepgram's error; otherwise fall through to it.
      if (!openaiKey) return res.status(err.status || 502).json({ error: err.message })
      console.warn('[llm] deepgram failed, falling back to whisper:', err.message)
    }
  }

  // 2) Whisper + ffmpeg fallback — no diarization.
  if (!ffmpegPath) {
    return res.status(500).json({ error: 'Audio processing is unavailable (ffmpeg not found on the server).' })
  }
  const dir = await mkdtemp(join(tmpdir(), 'lull-transcribe-'))
  try {
    const inPath = join(dir, 'input')
    await writeFile(inPath, file.buffer)
    // Downmix to mono 16 kHz MP3 and segment by time. -vn drops any video track (phone clips, screen
    // recordings); audio segments split exactly on time, no keyframe alignment needed.
    await runFfmpeg([
      '-i', inPath,
      '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'libmp3lame', '-b:a', '48k',
      '-f', 'segment', '-segment_time', String(SEGMENT_SEC),
      join(dir, 'chunk-%03d.mp3'),
    ])

    const chunkNames = (await readdir(dir)).filter((f) => f.startsWith('chunk-')).sort()
    if (!chunkNames.length) {
      return res.status(502).json({ error: 'Could not read any audio from that file. Is it a valid recording?' })
    }

    let fullText = ''
    const words: WhisperWord[] = []
    const segments: TranscriptSegment[] = []
    let offset = 0 // running start time (sec) for the current chunk
    for (const name of chunkNames) {
      const buf = await readFile(join(dir, name))
      const result = await whisperTranscribe(buf, 'audio/mpeg', name, openaiKey)
      if (result.text) fullText += (fullText ? ' ' : '') + result.text
      for (const w of result.words) {
        words.push({ word: w.word, start: (w.start ?? 0) + offset, end: (w.end ?? 0) + offset })
      }
      const dur = result.duration ?? SEGMENT_SEC
      segments.push({ index: segments.length, startSec: offset, durationSec: dur, text: result.text })
      offset += dur
    }

    const transcript = { text: fullText, words, durationSec: offset || null }
    res.json({ transcript, assetId, segments, diarized: false, utterances: [] })
  } catch (e) {
    if (e instanceof WhisperError) return res.status(e.status || 502).json({ error: e.message })
    console.error('[llm] long transcription failed', e)
    return res.status(500).json({ error: (e as Error)?.message || 'Long transcription failed.' })
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {})
  }
})

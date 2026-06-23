import { Router } from 'express'
import multer from 'multer'
import { randomUUID } from 'node:crypto'
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

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY || ''
const OPENAI_KEY = process.env.OPENAI_API_KEY || ''

export function providerStatus() {
  return { anthropic: Boolean(ANTHROPIC_KEY), openai: Boolean(OPENAI_KEY) }
}

// Transient upstream failures we ride out with backoff rather than surfacing to the user. 529 is
// Anthropic's "Overloaded"; 5xx and 429 are momentary saturation/rate. The request itself is fine.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 529])
const MAX_RETRIES = 3
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** POST to Anthropic, retrying transient errors with exponential backoff + jitter (honoring
 *  Retry-After when given). Returns the final Response; the caller handles non-ok statuses. */
async function postAnthropicWithRetry(body: unknown): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    let upstream: Response | null = null
    try {
      upstream = await fetch(ANTHROPIC_URL, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': ANTHROPIC_KEY,
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
    const backoff = 600 * 2 ** attempt + Math.floor(Math.random() * 300)
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
  schema: Record<string, unknown>
  maxTokens?: number
  temperature?: number
  thinking?: 'adaptive'
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
}

// POST /api/llm/chat → { parsed, raw }
llm.post('/chat', async (req, res) => {
  const b = req.body as ChatBody
  if ((b.provider ?? 'anthropic') !== 'anthropic') {
    return res.status(400).json({ error: 'Only the anthropic provider is implemented.' })
  }
  if (!ANTHROPIC_KEY) return res.status(503).json({ error: 'Server has no Anthropic API key configured.' })

  const outputConfig: Record<string, unknown> = { format: { type: 'json_schema', schema: b.schema } }
  if (b.effort) outputConfig.effort = b.effort
  const body: Record<string, unknown> = {
    model: b.model,
    max_tokens: b.maxTokens ?? 1500,
    system: b.system,
    messages: [{ role: 'user', content: b.user }],
    output_config: outputConfig,
  }
  if (typeof b.temperature === 'number') body.temperature = b.temperature
  if (b.thinking) body.thinking = { type: b.thinking }

  let upstream: Response
  try {
    upstream = await postAnthropicWithRetry(body)
  } catch {
    return res.status(502).json({ error: 'Network error reaching Anthropic.' })
  }

  if (!upstream.ok) {
    let detail = ''
    try {
      const err = (await upstream.json()) as { error?: { message?: string } }
      detail = err?.error?.message ? `: ${err.error.message}` : ''
    } catch {
      /* ignore */
    }
    // Still overloaded/saturated after retries — tell the user it's transient and to retry.
    if (RETRYABLE_STATUS.has(upstream.status)) {
      return res
        .status(upstream.status)
        .json({ error: `Anthropic is temporarily overloaded (${upstream.status})${detail}. Please try again in a moment.` })
    }
    return res.status(upstream.status).json({ error: `Analysis failed (${upstream.status})${detail}.` })
  }

  const data = (await upstream.json()) as {
    content?: Array<{ type: string; text?: string }>
    stop_reason?: string
    usage?: unknown
  }
  if (data.stop_reason === 'refusal') {
    return res.status(422).json({ error: 'The model declined to analyze this content.' })
  }
  const textBlock = (data.content || []).find((c) => c.type === 'text')
  if (!textBlock?.text) return res.status(502).json({ error: 'Empty analysis response.' })

  let parsed: unknown
  try {
    parsed = JSON.parse(textBlock.text)
  } catch {
    return res.status(502).json({ error: 'Could not parse the analysis response.' })
  }
  if (data.usage) console.log('[llm] chat usage', b.model, JSON.stringify(data.usage))
  res.json({ parsed, raw: data })
})

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } })

// POST /api/llm/transcribe (multipart: file, optional sessionId) → { transcript, assetId }
// Stores the original recording in MinIO (the user wants it kept) AND transcribes it.
llm.post('/transcribe', upload.single('file'), async (req, res) => {
  const file = req.file
  if (!file) return res.status(400).json({ error: 'file is required' })
  if (!OPENAI_KEY) return res.status(503).json({ error: 'Server has no OpenAI API key configured.' })

  // 1) Persist the original recording as an asset.
  const assetId = randomUUID()
  const kind = file.mimetype.startsWith('video/') ? 'video' : 'audio'
  const objectKey = `${kind}/${assetId}`
  const sessionId = req.body.sessionId ? String(req.body.sessionId) : null
  try {
    await putObject(objectKey, file.buffer, file.mimetype)
    await pool.query(
      `INSERT INTO assets (id, session_id, kind, object_key, content_type, size_bytes, original_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [assetId, sessionId, kind, objectKey, file.mimetype, file.size, file.originalname || null],
    )
  } catch (e) {
    console.error('[llm] failed to store recording', e)
    // Storage failure shouldn't block transcription — continue without an assetId.
  }

  // 2) Transcribe via Whisper.
  const form = new FormData()
  form.append('file', new Blob([file.buffer], { type: file.mimetype }), file.originalname || 'answer.webm')
  form.append('model', 'whisper-1')
  form.append('response_format', 'verbose_json')
  form.append('timestamp_granularities[]', 'word')

  let upstream: Response
  try {
    upstream = await fetch(WHISPER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPENAI_KEY}` },
      body: form,
    })
  } catch {
    return res.status(502).json({ error: 'Network error reaching the transcription service.' })
  }
  if (!upstream.ok) {
    let msg = ''
    try {
      msg = ((await upstream.json()) as { error?: { message?: string } })?.error?.message || ''
    } catch {
      /* ignore */
    }
    return res.status(upstream.status).json({ error: msg || `Transcription failed (${upstream.status}).` })
  }
  const data = (await upstream.json()) as { text?: string; words?: unknown; duration?: number }
  const fallback = req.body.fallbackDurationSec ? Number(req.body.fallbackDurationSec) : null
  const transcript = {
    text: (data.text || '').trim(),
    words: data.words,
    durationSec: typeof data.duration === 'number' && data.duration > 0 ? data.duration : fallback,
  }
  res.json({ transcript, assetId })
})

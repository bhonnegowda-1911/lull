// Provider-agnostic chat wrapper. Calls now go through the backend LLM gateway
// (`/api/llm/chat`) so provider API keys live only on the server, never in the browser.
// Prompt + schema construction stays here on the client; the gateway just forwards to the
// provider and returns the parsed structured output.

import { apiFetch } from './api'
import { getAnthropicKey } from './userKeys'
import { parsePartialJson } from './partialJson'

export type Provider = 'anthropic' | 'openai'

export type LlmErrorCode =
  | 'no_key'
  | 'network'
  | 'auth'
  | 'rate'
  | 'http'
  | 'refusal'
  | 'empty'
  | 'parse'
  | 'not_implemented'
  | 'bad_provider'

export class LlmError extends Error {
  code?: LlmErrorCode
  constructor(message: string, { code }: { code?: LlmErrorCode } = {}) {
    super(message)
    this.name = 'LlmError'
    this.code = code
  }
}

/** JSON Schema passed to the model to constrain the response shape. */
export type JsonSchema = Record<string, unknown>

export interface ChatStructuredRequest {
  provider: Provider
  model: string
  system: string
  user: string
  /**
   * Stable, reused leading portion of the user turn (e.g. an interview's prior transcript). The
   * gateway sends it as a cache_control breakpoint so the cached prefix covers system + this block;
   * later turns within a stage re-read it at ~0.1x input cost. Keep the volatile latest message in
   * `user`. No effect until the prefix clears the model's cache minimum (4096 tokens on Opus 4.8).
   */
  cachePrefix?: string
  /**
   * Optional base64 PNG images (no `data:` prefix) attached to the user turn as vision blocks —
   * e.g. the rendered system-design whiteboard, so the model can actually see the candidate's
   * diagram. Forwarded to the gateway and ignored when empty.
   */
  images?: string[]
  schema: JsonSchema
  maxTokens?: number
  /**
   * Sampling temperature. Only sent to the API when a number is provided — omit it for
   * Opus 4.7+/Fable models, which reject the parameter. Pass 0 for deterministic grading.
   */
  temperature?: number
  /** Adaptive thinking (Opus 4.6+/Sonnet 4.6). Lets the model reason before answering. */
  thinking?: 'adaptive'
  /** Thinking depth / overall token spend. Defaults to the model's `high` when omitted. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  signal?: AbortSignal
}

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string }>
  stop_reason?: string
}

function codeForStatus(status: number): LlmErrorCode {
  if (status === 503) return 'no_key'
  if (status === 401) return 'auth'
  if (status === 422) return 'refusal'
  if (status === 429) return 'rate'
  return 'http'
}

/** Run a single structured-output chat completion via the backend gateway. */
export async function chatStructured<T = unknown>(
  req: ChatStructuredRequest,
): Promise<{ parsed: T; raw: AnthropicResponse }> {
  const { signal, ...body } = req
  // BYOK: send the user's own key (held only in this browser) per request. Omitted when unset,
  // so the server can fall back to its env key for local/single-user setups.
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const userKey = getAnthropicKey()
  if (userKey) headers['x-anthropic-key'] = userKey
  let res: Response
  try {
    res = await apiFetch(`/api/llm/chat`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new LlmError('Network error reaching the analysis service.', { code: 'network' })
  }

  if (!res.ok) {
    let message = `Analysis failed (${res.status}).`
    try {
      const err = (await res.json()) as { error?: string }
      if (err?.error) message = err.error
    } catch {
      // non-JSON error body
    }
    throw new LlmError(message, { code: codeForStatus(res.status) })
  }

  let data: { parsed?: T; raw?: AnthropicResponse }
  try {
    data = (await res.json()) as { parsed?: T; raw?: AnthropicResponse }
  } catch {
    throw new LlmError('Could not parse the analysis response.', { code: 'parse' })
  }
  if (data.parsed === undefined) throw new LlmError('Empty analysis response.', { code: 'empty' })
  return { parsed: data.parsed, raw: data.raw ?? {} }
}

/** Progress events surfaced while a streamed completion is in flight. */
export type StreamEvent<T> =
  /** The model moved into its `thinking` phase (silent) or started `writing` the JSON answer. */
  | { type: 'phase'; phase: 'thinking' | 'writing' }
  /** Best-effort snapshot of the answer parsed from the JSON streamed so far. */
  | { type: 'partial'; value: Partial<T> }

/**
 * Streaming variant of {@link chatStructured}. Runs the same structured-output request through the
 * SSE gateway (`/api/llm/chat/stream`) and invokes `onEvent` as the model works — a phase change, or
 * a progressively-parsed partial answer — so the UI can reveal fields as they close instead of
 * blocking on a spinner. Resolves with the same `{ parsed, raw }` as the blocking call. Callers that
 * don't need progress can keep using `chatStructured`.
 */
export async function chatStructuredStream<T = unknown>(
  req: ChatStructuredRequest,
  onEvent: (ev: StreamEvent<T>) => void,
): Promise<{ parsed: T; raw: AnthropicResponse }> {
  const { signal, ...body } = req
  const headers: Record<string, string> = { 'content-type': 'application/json' }
  const userKey = getAnthropicKey()
  if (userKey) headers['x-anthropic-key'] = userKey

  let res: Response
  try {
    res = await apiFetch(`/api/llm/chat/stream`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal,
    })
  } catch (e) {
    if ((e as Error)?.name === 'AbortError') throw e
    throw new LlmError('Network error reaching the analysis service.', { code: 'network' })
  }

  // Pre-stream failures come back as ordinary JSON (bad key, upstream overloaded, etc.).
  if (!res.ok) {
    let message = `Analysis failed (${res.status}).`
    try {
      const err = (await res.json()) as { error?: string }
      if (err?.error) message = err.error
    } catch {
      /* non-JSON error body */
    }
    throw new LlmError(message, { code: codeForStatus(res.status) })
  }
  if (!res.body) throw new LlmError('Empty analysis response.', { code: 'empty' })

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let jsonText = ''
  let lastEmitted = ''
  let done: { parsed: T; raw: AnthropicResponse } | null = null
  let streamError: LlmError | null = null

  const handleFrame = (frame: string) => {
    const lines = frame.split('\n')
    const event = lines.find((l) => l.startsWith('event:'))?.slice(6).trim()
    const dataLine = lines.find((l) => l.startsWith('data:'))
    if (!event || !dataLine) return
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(dataLine.slice(5).trim())
    } catch {
      return
    }
    if (event === 'phase') {
      onEvent({ type: 'phase', phase: payload.phase as 'thinking' | 'writing' })
    } else if (event === 'text') {
      jsonText += String(payload.text ?? '')
      // Only re-parse + emit when the snapshot actually changed, to avoid churn on every token.
      const snapshot = JSON.stringify(parsePartialJson(jsonText) ?? null)
      if (snapshot !== lastEmitted) {
        lastEmitted = snapshot
        const value = parsePartialJson(jsonText)
        if (value && typeof value === 'object') onEvent({ type: 'partial', value: value as Partial<T> })
      }
    } else if (event === 'done') {
      done = { parsed: payload.parsed as T, raw: (payload.raw as AnthropicResponse) ?? {} }
    } else if (event === 'error') {
      streamError = new LlmError(String(payload.message || 'Analysis failed.'), { code: 'http' })
    }
  }

  for (;;) {
    const { done: streamDone, value } = await reader.read()
    if (streamDone) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      handleFrame(buf.slice(0, idx))
      buf = buf.slice(idx + 2)
    }
  }
  if (buf.trim()) handleFrame(buf)

  if (streamError) throw streamError
  if (!done) throw new LlmError('The analysis stream ended unexpectedly.', { code: 'empty' })
  return done
}

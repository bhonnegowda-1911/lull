// Provider-agnostic chat wrapper. Calls now go through the backend LLM gateway
// (`/api/llm/chat`) so provider API keys live only on the server, never in the browser.
// Prompt + schema construction stays here on the client; the gateway just forwards to the
// provider and returns the parsed structured output.

import { API_BASE as BASE } from './api'
import { getAnthropicKey } from './userKeys'

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
    res = await fetch(`${BASE}/api/llm/chat`, {
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

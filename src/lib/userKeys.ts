// Bring-your-own-key store. The user's provider API keys live ONLY in this browser
// (localStorage) and are sent per request as headers to our gateway, which uses them in memory
// and never persists them. This is a plain module (not React) so non-component code —
// llmClient, transcribe — can read the current key at request time; ApiKeyContext wraps it for
// reactive UI. Keys are the user's own secret on their own machine: we don't encrypt localStorage
// (the decryption key would sit right beside it), and rely on HTTPS to protect them in transit.

const ANTHROPIC_KEY = 'byok.anthropicKey'
const OPENAI_KEY = 'byok.openaiKey'
const DEEPGRAM_KEY = 'byok.deepgramKey'

function read(key: string): string {
  try {
    return localStorage.getItem(key) || ''
  } catch {
    return ''
  }
}

function write(key: string, value: string): void {
  try {
    const v = value.trim()
    if (v) localStorage.setItem(key, v)
    else localStorage.removeItem(key)
  } catch {
    // localStorage may be unavailable (private mode); BYOK simply won't persist.
  }
}

export const getAnthropicKey = (): string => read(ANTHROPIC_KEY)
export const getOpenaiKey = (): string => read(OPENAI_KEY)
export const getDeepgramKey = (): string => read(DEEPGRAM_KEY)
export const setAnthropicKey = (value: string): void => write(ANTHROPIC_KEY, value)
export const setOpenaiKey = (value: string): void => write(OPENAI_KEY, value)
export const setDeepgramKey = (value: string): void => write(DEEPGRAM_KEY, value)

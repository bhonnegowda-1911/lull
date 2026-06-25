import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from 'react'
import {
  getAnthropicKey,
  getOpenaiKey,
  getDeepgramKey,
  setAnthropicKey as persistAnthropicKey,
  setOpenaiKey as persistOpenaiKey,
  setDeepgramKey as persistDeepgramKey,
} from '../lib/userKeys'

// BYOK: each user's provider keys live in THIS browser (localStorage via userKeys) and are sent
// per request to the backend gateway, which uses them in memory and never stores them. The server
// may also carry its own env keys as a fallback for local/single-user setups, so a provider counts
// as "available" when either the user has entered a key OR the server reports one. The context
// name is kept (`useApiKeys`) so call sites don't churn.

const BASE = import.meta.env.VITE_API_BASE ?? ''

interface ApiKeyContextValue {
  /** True while the initial config fetch is in flight. */
  loading: boolean
  /** True if the backend responded (server reachable). */
  online: boolean
  hasOpenai: boolean
  hasAnthropic: boolean
  /** Optional: a Deepgram key enables diarized (speaker-separated) interview transcription. */
  hasDeepgram: boolean
  hasAllKeys: boolean
  /** The user's own keys held in this browser (empty string when unset). */
  openaiKey: string
  anthropicKey: string
  deepgramKey: string
  setOpenaiKey: (value: string) => void
  setAnthropicKey: (value: string) => void
  setDeepgramKey: (value: string) => void
  refresh: () => void
}

const ApiKeyContext = createContext<ApiKeyContextValue | null>(null)

export function ApiKeyProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [online, setOnline] = useState(false)
  const [providers, setProviders] = useState({ openai: false, anthropic: false, deepgram: false })
  // The user's own keys, hydrated from localStorage; setters write through and re-render gates.
  const [openaiKey, setOpenaiKeyState] = useState(getOpenaiKey)
  const [anthropicKey, setAnthropicKeyState] = useState(getAnthropicKey)
  const [deepgramKey, setDeepgramKeyState] = useState(getDeepgramKey)

  const setOpenaiKey = useCallback((value: string) => {
    persistOpenaiKey(value)
    setOpenaiKeyState(value.trim())
  }, [])
  const setAnthropicKey = useCallback((value: string) => {
    persistAnthropicKey(value)
    setAnthropicKeyState(value.trim())
  }, [])
  const setDeepgramKey = useCallback((value: string) => {
    persistDeepgramKey(value)
    setDeepgramKeyState(value.trim())
  }, [])

  const refresh = useCallback(() => {
    setLoading(true)
    fetch(`${BASE}/api/config`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('config unavailable'))))
      .then((data: { providers?: { openai?: boolean; anthropic?: boolean; deepgram?: boolean } }) => {
        setProviders({
          openai: Boolean(data.providers?.openai),
          anthropic: Boolean(data.providers?.anthropic),
          deepgram: Boolean(data.providers?.deepgram),
        })
        setOnline(true)
      })
      .catch(() => {
        setProviders({ openai: false, anthropic: false, deepgram: false })
        setOnline(false)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(refresh, [refresh])

  const hasOpenai = Boolean(openaiKey) || providers.openai
  const hasAnthropic = Boolean(anthropicKey) || providers.anthropic
  const hasDeepgram = Boolean(deepgramKey) || providers.deepgram
  const value: ApiKeyContextValue = {
    loading,
    online,
    hasOpenai,
    hasAnthropic,
    hasDeepgram,
    hasAllKeys: hasOpenai && hasAnthropic,
    openaiKey,
    anthropicKey,
    deepgramKey,
    setOpenaiKey,
    setAnthropicKey,
    setDeepgramKey,
    refresh,
  }

  return <ApiKeyContext.Provider value={value}>{children}</ApiKeyContext.Provider>
}

export function useApiKeys(): ApiKeyContextValue {
  const ctx = useContext(ApiKeyContext)
  if (!ctx) throw new Error('useApiKeys must be used within an ApiKeyProvider')
  return ctx
}

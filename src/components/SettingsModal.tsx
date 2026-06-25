import { useEffect, useState } from 'react'
import { useApiKeys } from '../context/ApiKeyContext'

// BYOK settings. Users paste their own OpenAI (Whisper transcription) and Anthropic (Claude
// analysis) keys; they're kept only in this browser and sent per request to the backend, which
// uses them in memory and never stores them. If the server has its own env keys, they act as a
// fallback, so a provider can be "ready" even without a user key.

function maskKey(key: string): string {
  if (!key) return ''
  if (key.length <= 8) return '••••'
  return `${key.slice(0, 3)}…${key.slice(-4)}`
}

function KeyField({
  label,
  help,
  value,
  serverFallback,
  onSave,
}: {
  label: string
  help: string
  value: string
  serverFallback: boolean
  onSave: (value: string) => void
}) {
  const [draft, setDraft] = useState('')
  // Reset the editable draft whenever the saved value changes (e.g. after Save/Clear).
  useEffect(() => setDraft(''), [value])

  return (
    <div className="rounded-lg border border-stone-200 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-stone-700">{label}</span>
        {value ? (
          <span className="text-xs font-medium text-green-600">✓ Saved ({maskKey(value)})</span>
        ) : serverFallback ? (
          <span className="text-xs font-medium text-stone-500">Using server key</span>
        ) : (
          <span className="text-xs font-medium text-red-600">✗ Not set</span>
        )}
      </div>
      <p className="mt-1 text-xs text-stone-500">{help}</p>
      <div className="mt-2 flex gap-2">
        <input
          type="password"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={value ? 'Enter a new key to replace' : 'Paste your key'}
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-stone-200 px-2.5 py-1.5 font-mono text-sm text-stone-800 placeholder:text-stone-400 focus:border-terracotta-400 focus:outline-none focus:ring-1 focus:ring-terracotta-400"
        />
        <button
          type="button"
          onClick={() => onSave(draft)}
          disabled={!draft.trim()}
          className="rounded-md bg-terracotta-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-terracotta-500 disabled:opacity-50"
        >
          Save
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onSave('')}
            className="rounded-md border border-stone-300 px-3 py-1.5 text-sm font-medium text-stone-600 hover:bg-stone-50"
          >
            Clear
          </button>
        )}
      </div>
    </div>
  )
}

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const {
    loading,
    online,
    hasOpenai,
    hasAnthropic,
    hasDeepgram,
    openaiKey,
    anthropicKey,
    deepgramKey,
    setOpenaiKey,
    setAnthropicKey,
    setDeepgramKey,
  } = useApiKeys()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-stone-900">API keys</h2>
        <p className="mt-1 text-sm text-stone-500">
          Bring your own keys. They're stored only in this browser and sent securely with each
          request — we never save them on the server.
        </p>

        <div className="mt-5 space-y-3">
          {loading ? (
            <p className="text-sm text-stone-500">Checking server…</p>
          ) : !online ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Backend not reachable. Start it with <code className="font-mono">./dev.sh server</code>{' '}
              (and <code className="font-mono">docker compose up -d</code>).
            </div>
          ) : (
            <>
              <KeyField
                label="Anthropic (Claude analysis)"
                help="Used for interviews, grading, and report generation. Get one at console.anthropic.com."
                value={anthropicKey}
                serverFallback={hasAnthropic && !anthropicKey}
                onSave={setAnthropicKey}
              />
              <KeyField
                label="OpenAI (Whisper transcription)"
                help="Used to transcribe your voice answers. Get one at platform.openai.com."
                value={openaiKey}
                serverFallback={hasOpenai && !openaiKey}
                onSave={setOpenaiKey}
              />
              <KeyField
                label="Deepgram (speaker separation — optional)"
                help="Optional. With a Deepgram key, uploaded interview recordings are transcribed with speaker labels (interviewer vs you). Without it, transcription falls back to Whisper. Get one at deepgram.com."
                value={deepgramKey}
                serverFallback={hasDeepgram && !deepgramKey}
                onSave={setDeepgramKey}
              />
            </>
          )}
        </div>

        <p className="mt-4 text-xs text-stone-400">
          Keys are held in your browser's local storage on this device. Serve the app over HTTPS in
          production so they're encrypted in transit.
        </p>

        <div className="mt-6 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md bg-terracotta-600 px-4 py-2 text-sm font-medium text-white hover:bg-terracotta-500"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  )
}

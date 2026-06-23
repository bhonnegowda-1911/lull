import { useApiKeys } from '../context/ApiKeyContext'

// LLM keys live on the server (set in server/.env). This modal is informational: it shows whether
// the backend is reachable and which providers it has configured. Your profile (resume + target
// level) and the project/story bank are managed in the Prep section, not here.

function StatusRow({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between rounded-lg border border-stone-200 px-3 py-2">
      <span className="text-sm text-stone-700">{label}</span>
      <span className={`text-sm font-medium ${ok ? 'text-green-600' : 'text-red-600'}`}>
        {ok ? '✓ Configured' : '✗ Missing'}
      </span>
    </div>
  )
}

export default function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { loading, online, hasOpenai, hasAnthropic, refresh } = useApiKeys()

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-stone-900">LLM configuration</h2>
        <p className="mt-1 text-sm text-stone-500">
          API keys live on the server now (set them in <code className="font-mono">server/.env</code>).
          Your audio and transcript are sent to OpenAI (transcription) and Anthropic (analysis)
          through the backend when you run a session.
        </p>

        <div className="mt-5 space-y-2">
          {loading ? (
            <p className="text-sm text-stone-500">Checking server…</p>
          ) : !online ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              Backend not reachable. Start it with <code className="font-mono">./dev.sh server</code>{' '}
              (and <code className="font-mono">docker compose up -d</code>).
            </div>
          ) : (
            <>
              <StatusRow label="OpenAI (Whisper transcription)" ok={hasOpenai} />
              <StatusRow label="Anthropic (Claude analysis)" ok={hasAnthropic} />
            </>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={refresh}
            className="rounded-md border border-stone-300 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
          >
            Re-check
          </button>
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

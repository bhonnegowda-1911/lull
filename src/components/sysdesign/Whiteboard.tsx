import { useCallback, useRef, useState } from 'react'
import { Excalidraw } from '@excalidraw/excalidraw'
import '@excalidraw/excalidraw/index.css'
import type { WhiteboardScene } from '../../lib/sysdesign/persistence'

// Embedded Excalidraw whiteboard for the system-design interview. Excalidraw owns its own
// scene state once mounted, so we seed it from the persisted scene exactly once (initialData)
// and stream changes back out via a debounced onChange. The parent folds the scene into the
// session reducer, which already mirrors to localStorage (instant resume) and the backend
// session store (durable history). This module is the lazy-load boundary for the (heavy)
// Excalidraw bundle + its CSS — nothing here is pulled in until the board is first opened.

export default function Whiteboard({
  initial,
  onChange,
  readOnly = false,
}: {
  initial: WhiteboardScene | null
  onChange?: (scene: WhiteboardScene) => void
  /** Render the scene view-only (pan/zoom, no editing) — used to revisit the board in the report. */
  readOnly?: boolean
}) {
  // Capture the seed once. Feeding initialData on every render would reset the canvas, and
  // Excalidraw is uncontrolled — it manages its own state after this first mount.
  const [initialData] = useState(() =>
    initial
      ? {
          elements: initial.elements as never,
          appState: {
            viewBackgroundColor: initial.appState?.viewBackgroundColor ?? '#ffffff',
            viewModeEnabled: readOnly,
          },
          scrollToContent: true,
        }
      : readOnly
        ? { appState: { viewModeEnabled: true }, scrollToContent: true }
        : undefined,
  )
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastSerialized = useRef<string>('')

  const handleChange = useCallback(
    (elements: readonly unknown[], appState: { viewBackgroundColor: string }) => {
      // onChange also fires on selection / scroll / zoom; only persist when the elements
      // themselves change, and debounce so a drawing gesture writes once, not per frame.
      if (!onChange) return
      const serialized = JSON.stringify(elements)
      if (serialized === lastSerialized.current) return
      lastSerialized.current = serialized
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => {
        onChange({
          elements: elements as unknown[],
          appState: { viewBackgroundColor: appState.viewBackgroundColor },
        })
      }, 700)
    },
    [onChange],
  )

  // Fill whatever box the panel gives us — a fixed 520px card normally, or the whole viewport
  // when maximized. The panel owns the outer sizing so this one instance is never remounted.
  return (
    <div className="h-full w-full overflow-hidden">
      <Excalidraw initialData={initialData} onChange={handleChange} />
    </div>
  )
}

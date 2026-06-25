import type { WhiteboardScene } from './persistence'

// Render a persisted Excalidraw scene to a base64 PNG so the interviewer/evaluator can actually
// SEE the candidate's diagram (Claude vision), not just the spoken transcript. Excalidraw's
// exporter is part of the heavy canvas bundle, so we dynamic-import it here — this stays off the
// main bundle and is only pulled in when a turn/report actually ships a board. Returns the raw
// base64 (no data: prefix, as the LLM gateway's image block expects), or null when there's
// nothing worth sending (empty board) or the export fails (never block a turn on a diagram).

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Export the scene to a base64 PNG, or null if the board is empty / export fails. */
export async function sceneToPngBase64(scene: WhiteboardScene | null): Promise<string | null> {
  if (!scene?.elements?.length) return null
  try {
    const { exportToBlob } = await import('@excalidraw/excalidraw')
    const blob = await exportToBlob({
      elements: scene.elements as never,
      files: null,
      mimeType: 'image/png',
      appState: {
        exportBackground: true,
        viewBackgroundColor: scene.appState?.viewBackgroundColor ?? '#ffffff',
      },
    })
    return await blobToBase64(blob)
  } catch {
    return null
  }
}

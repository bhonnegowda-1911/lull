// Client for media assets (voice recordings, system-design images/video, later resume/JD
// files). Bytes are proxied through the backend to object storage (MinIO); we keep only the
// returned asset id and reference it from a session payload. `assetUrl(id)` is usable
// directly as an <img>/<audio>/<video> src.

import { API_BASE as BASE } from './api'

export type AssetKind = 'audio' | 'video' | 'image' | 'pdf' | 'file'

export interface UploadedAsset {
  id: string
  kind: AssetKind
  contentType: string
  sizeBytes: number
}

export interface UploadMeta {
  kind?: AssetKind
  sessionId?: string
  filename?: string
}

/** Upload a blob; returns the stored asset, or null if the backend is unavailable. */
export async function uploadAsset(blob: Blob, meta: UploadMeta = {}): Promise<UploadedAsset | null> {
  const form = new FormData()
  form.append('file', blob, meta.filename || 'upload')
  if (meta.kind) form.append('kind', meta.kind)
  if (meta.sessionId) form.append('sessionId', meta.sessionId)
  try {
    const res = await fetch(`${BASE}/api/assets`, { method: 'POST', body: form })
    if (!res.ok) return null
    return (await res.json()) as UploadedAsset
  } catch {
    return null
  }
}

/** A streamable URL for an asset (served by the backend from object storage). */
export function assetUrl(id: string): string {
  return `${BASE}/api/assets/${id}`
}

export async function deleteAsset(id: string): Promise<void> {
  try {
    await fetch(`${BASE}/api/assets/${id}`, { method: 'DELETE' })
  } catch {
    // best effort
  }
}

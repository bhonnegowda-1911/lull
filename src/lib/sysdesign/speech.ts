import { analyzeFillers } from '../analyzers/fillerAnalyzer'
import type { FillerResult } from '../../types'
import type { VoiceClip } from './persistence'

// Delivery metrics for a system-design round, computed over the candidate's recorded voice
// answers (typed answers carry no audio, so they don't count toward speaking pace). Pure and
// testable: pace (words per minute) plus the shared filler-word analysis (total + per-minute).

export interface SpeechMetrics {
  clipCount: number
  /** Total spoken seconds across clips with a known duration. */
  durationSec: number
  wordCount: number
  /** Speaking pace, or null when no clip had a usable duration. */
  wpm: number | null
  filler: FillerResult
}

function countWords(s: string): number {
  const m = s.trim().match(/\S+/g)
  return m ? m.length : 0
}

/** Aggregate delivery metrics over recorded voice clips, or null when there are none. */
export function speechMetrics(clips: VoiceClip[] = []): SpeechMetrics | null {
  if (!clips.length) return null
  const text = clips
    .map((c) => c.text)
    .join(' ')
    .trim()
  const durationSec = clips.reduce(
    (sum, c) => sum + (c.durationSec && c.durationSec > 0 ? c.durationSec : 0),
    0,
  )
  const wordCount = countWords(text)
  const wpm = durationSec > 0 ? Math.round(wordCount / (durationSec / 60)) : null
  const filler = analyzeFillers(text, durationSec > 0 ? durationSec : null)
  return { clipCount: clips.length, durationSec, wordCount, wpm, filler }
}

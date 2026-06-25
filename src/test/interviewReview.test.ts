import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// End-to-end test of the recorded-interview review pipeline: a recording Blob → long transcription
// (server boundary mocked at fetch) → grading (the LLM gateway mocked at chatStructured) → the
// assembled InterviewReviewSession the UI saves to history. The two external services are stubbed,
// so this runs in CI; the ffmpeg segmentation + Whisper stitching that lives behind /transcribe-long
// is exercised separately (manually verified against real ffmpeg). Also guards the maxTokens
// regression that caused "Could not parse the analysis response" on the behavioral grade.

import type { InterviewReview, InterviewReviewSession, Transcript } from '../types'

// chatStructured is the single chokepoint reviewInterview() calls — stub it so we can both assert the
// request it builds and hand back a canned grade. Captured per-call so tests can inspect the args.
const chatStructuredMock = vi.fn()
vi.mock('../lib/llmClient', () => ({
  chatStructured: (...args: unknown[]) => chatStructuredMock(...args),
  // Keep the error class importable for any consumer that references it.
  LlmError: class LlmError extends Error {},
}))

import { transcribeLong, TranscribeError } from '../lib/transcribe'
import { reviewInterview } from '../lib/reviewInterview'
import { extractStoriesFromInterview, INTERVIEW_STORIES_SCHEMA } from '../lib/stories/extractFromInterview'
import { STAR_CRITERIA } from '../data/criteria'
import { GEN_MODEL } from '../lib/models'
import { INTERVIEW_REVIEW_MODEL, INTERVIEW_REVIEW_SCHEMA } from '../data/interviewReviewCriteria'

// ---- Fixtures -------------------------------------------------------------

const STITCHED_TRANSCRIPT: Transcript = {
  text: 'Tell me about a time you led a project. I led the payments migration last year and cut latency by 40 percent.',
  words: [
    { word: 'Tell', start: 0.1, end: 0.3 },
    // a word from the second chunk — its start is already offset past chunk 1 (600s) by the server
    { word: 'migration', start: 612.4, end: 612.9 },
  ],
  durationSec: 1140, // ~19 min across two chunks
}

function fakeTranscribeResponse() {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      transcript: STITCHED_TRANSCRIPT,
      assetId: 'asset-123',
      segments: [
        { index: 0, startSec: 0, durationSec: 600, text: 'Tell me about a time you led a project.' },
        { index: 1, startSec: 600, durationSec: 540, text: 'I led the payments migration last year and cut latency by 40 percent.' },
      ],
      diarized: false,
      utterances: [],
    }),
  }
}

const REVIEW: InterviewReview = {
  roundType: 'behavioral',
  roundConfidence: 'high',
  roundRationale: 'STAR-style questions about past leadership.',
  overallScore: 82,
  grade: 'B',
  hireSignal: 'yes',
  summary: 'Strong concrete example with quantified impact; could tighten the setup.',
  dimensions: [
    { key: 'structure', label: 'Structure (STAR)', score: 4, note: 'Clear situation and result.' },
    { key: 'impact', label: 'Impact', score: 4, note: 'Quantified the latency win.' },
  ],
  exchanges: [
    {
      question: 'Tell me about a time you led a project.',
      answerSummary: 'Led the payments migration, cut latency 40%.',
      assessment: 'Good headline result; light on the obstacles navigated.',
      score: 4,
      betterAnswer: 'Open with the result, then name the hardest tradeoff you owned.',
    },
  ],
  strengths: ['Quantified impact'],
  improvements: ['Lead with the outcome sooner'],
  redFlags: [],
}

function makeRecording(bytes = 2_000_000): Blob {
  return new Blob([new Uint8Array(bytes)], { type: 'audio/mp4' })
}

// ---- Setup ----------------------------------------------------------------

beforeEach(() => {
  chatStructuredMock.mockReset()
  chatStructuredMock.mockResolvedValue({ parsed: REVIEW, raw: {} })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// ---- transcribeLong (client → /api/llm/transcribe-long) -------------------

describe('transcribeLong', () => {
  it('POSTs the recording to the long-transcription endpoint and returns the stitched transcript + segments', async () => {
    const fetchMock = vi.fn(async () => fakeTranscribeResponse() as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    const result = await transcribeLong(makeRecording(), { sessionId: 'sess-1' })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, opts] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toMatch(/\/api\/llm\/transcribe-long$/)
    expect(opts.method).toBe('POST')
    expect(opts.body).toBeInstanceOf(FormData)
    // sessionId is forwarded so the stored recording links to the review session.
    expect((opts.body as FormData).get('sessionId')).toBe('sess-1')

    expect(result.transcript.text).toContain('payments migration')
    expect(result.assetId).toBe('asset-123')
    expect(result.segments).toHaveLength(2)
    // Second chunk's start time is offset past the first — proves the server stitched, not reset.
    expect(result.segments[1].startSec).toBe(600)
  })

  it('rejects an over-limit upload before hitting the network', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)

    const huge = makeRecording(301 * 1024 * 1024)
    await expect(transcribeLong(huge)).rejects.toMatchObject({ code: 'too_large' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('surfaces the server error message on failure', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({ error: 'ffmpeg blew up' }),
    }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    await expect(transcribeLong(makeRecording())).rejects.toBeInstanceOf(TranscribeError)
    await expect(transcribeLong(makeRecording())).rejects.toThrow('ffmpeg blew up')
  })

  it('surfaces diarization (speaker labels) when the server returns a diarized transcript', async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        transcript: {
          text: 'Speaker 0: Tell me about a project you led.\nSpeaker 1: I led the payments migration.',
          words: [{ word: 'Tell', start: 0.1, end: 0.3, speaker: 0 }],
          durationSec: 60,
        },
        assetId: 'a1',
        segments: [],
        diarized: true,
        utterances: [
          { speaker: 0, start: 0, end: 2.5, text: 'Tell me about a project you led.' },
          { speaker: 1, start: 2.6, end: 5, text: 'I led the payments migration.' },
        ],
      }),
    }) as unknown as Response)
    vi.stubGlobal('fetch', fetchMock)

    const result = await transcribeLong(makeRecording())
    expect(result.diarized).toBe(true)
    expect(result.utterances).toHaveLength(2)
    expect(result.utterances[1].speaker).toBe(1)
    // The speaker labels reach the transcript text, so the grader can separate interviewer from candidate.
    expect(result.transcript.text).toContain('Speaker 0:')
    expect(result.transcript.text).toContain('Speaker 1:')
  })
})

// ---- reviewInterview (client → /api/llm/chat via chatStructured) ----------

describe('reviewInterview', () => {
  it('grades the transcript with the review rubric on the report-tier model', async () => {
    const review = await reviewInterview({ transcript: STITCHED_TRANSCRIPT, label: 'Acme — HM round' })

    expect(review).toEqual(REVIEW)
    expect(chatStructuredMock).toHaveBeenCalledTimes(1)
    const req = chatStructuredMock.mock.calls[0][0] as Record<string, unknown>
    expect(req.model).toBe(INTERVIEW_REVIEW_MODEL)
    expect(req.schema).toBe(INTERVIEW_REVIEW_SCHEMA)
    // Long transcripts need real output headroom for the per-question breakdown.
    expect(req.maxTokens as number).toBeGreaterThanOrEqual(4000)
    // The transcript itself — and the user's label — must reach the grader.
    expect(req.user as string).toContain('payments migration')
    expect(req.user as string).toContain('Acme — HM round')
  })
})

// ---- Full pipeline: recording → transcript → graded review session --------

describe('interview review pipeline (end to end)', () => {
  it('turns a recording into the session payload the history view stores', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => fakeTranscribeResponse() as unknown as Response))

    // 1) Transcribe the whole recording.
    const sessionId = 'sess-e2e'
    const { transcript, assetId, diarized, utterances } = await transcribeLong(makeRecording(), { sessionId })
    expect(transcript.text.length).toBeGreaterThan(0)

    // 2) Grade it.
    const review = await reviewInterview({ transcript, label: null })

    // 3) Assemble exactly what InterviewReviewView saves (kind: interview_review).
    const payload: InterviewReviewSession = {
      review,
      transcript,
      assetId,
      label: null,
      durationSec: transcript.durationSec,
      diarized,
      utterances,
      createdAt: Date.now(),
    }
    const title = payload.label || `${review.roundType.replace(/_/g, ' ')} interview`
    const level = review.grade

    expect(title).toBe('behavioral interview')
    expect(level).toBe('B')
    expect(payload.assetId).toBe('asset-123')
    expect(payload.durationSec).toBe(1140)
    expect(payload.review.exchanges[0].betterAnswer).toContain('Open with the result')
  })
})

// ---- Mining stories out of the interview transcript -----------------------

describe('extractStoriesFromInterview', () => {
  it('distills the transcript into story drafts via the GEN model + stories schema', async () => {
    const draft = {
      title: 'Cut billing latency 40%',
      roleRef: 'Acme',
      star: { situation: 's', task: 't', actions: ['a'], result: 'r', takeaway: '' },
      impact: { metrics: ['40% latency'], ownership: 'i', blastRadius: 'team' },
      themes: [],
      trueCeilingLevel: 'senior',
    }
    chatStructuredMock.mockResolvedValueOnce({ parsed: { stories: [draft] }, raw: {} })

    const stories = await extractStoriesFromInterview({ transcript: STITCHED_TRANSCRIPT, label: 'Acme — HM' })

    expect(stories).toEqual([draft])
    const req = chatStructuredMock.mock.calls[0][0] as Record<string, unknown>
    expect(req.model).toBe(GEN_MODEL)
    expect(req.schema).toBe(INTERVIEW_STORIES_SCHEMA)
    expect(req.user as string).toContain('payments migration')
  })

  it('returns an empty array when the interview has no stories', async () => {
    chatStructuredMock.mockResolvedValueOnce({ parsed: { stories: [] }, raw: {} })
    expect(await extractStoriesFromInterview({ transcript: STITCHED_TRANSCRIPT })).toEqual([])
  })
})

// ---- Regression: the behavioral parse-failure bug -------------------------

describe('STAR grading token budget (regression)', () => {
  it('sets explicit output headroom so the grade JSON is not truncated', () => {
    // The default gateway budget (1500) truncates the STAR + level + coaching JSON, which then fails
    // JSON.parse on the server as "Could not parse the analysis response." Keep real headroom here.
    expect(STAR_CRITERIA.maxTokens).toBeGreaterThanOrEqual(3000)
  })
})

import { describe, it, expect } from 'vitest'
import { generateResume, gapFillsToStories, serializeSources } from '../lib/resume/generate'
import { analyzeResumeFit } from '../lib/resume/fit'
import { resumeToMarkdown } from '../lib/resume/generate'
import { scoreResume } from './scorers'
import { judgeResume } from './judge'
import { EVAL_CASES } from './cases'

// Model-driven resume eval. Runs ONLY via `npm run eval` (own vitest config) because it makes real
// LLM calls through the /api/llm/chat gateway — so the server must be up and keyed:
//   npm run server            # terminal 1, with ANTHROPIC_API_KEY set
//   npm run eval              # terminal 2
// It layers three signals per case: deterministic grounding/gap checks (scorers.ts), the tailoring
// LIFT metric (re-score the draft with the same fit analyzer and compare to the stored resume), and
// an LLM judge for voice/quality. Deterministic checks are hard failures; lift/judge use thresholds.

const RUN_JUDGE = process.env.EVAL_JUDGE !== '0' // set EVAL_JUDGE=0 to skip the LLM-judge layer

describe('resume generation evals', () => {
  for (const c of EVAL_CASES) {
    it(
      c.name,
      async () => {
        const gapStories = gapFillsToStories(c.gapFills ?? [])
        const allStories = [...gapStories, ...c.stories]

        // Baseline: the stored resume scored against the JD (the number tailoring must beat).
        const baseline = await analyzeResumeFit({ resumeText: c.profile.resumeText, job: c.job, stories: allStories })

        const resume = await generateResume({ profile: c.profile, stories: allStories, projects: c.projects, job: c.job, fit: baseline })

        // --- L0/L2: deterministic grounding, faithfulness, gap-surfacing -----------------------
        const report = scoreResume({
          resume,
          job: c.job,
          resumeText: c.profile.resumeText,
          sourceText: serializeSources({ profile: c.profile, stories: allStories, projects: c.projects }),
          known: { storyIds: new Set(allStories.map((s) => s.id)), projectIds: new Set(c.projects.map((p) => p.id)) },
          gapMarkers: c.gapMarkers,
          mustNotClaim: c.mustNotClaim,
        })

        expect(report.ungroundedBullets, 'every bullet must trace to a source').toEqual([])
        expect(report.inventedMetrics, 'no invented metrics').toEqual([])
        expect(report.identityPreserved, 'name + contact copied verbatim').toBe(true)
        expect(report.inventedSkillCategories, 'no re-categorized skills').toEqual([])
        expect(report.overClaims, 'must not claim unsupported experience').toEqual([])
        expect(report.missingGapMarkers, 'gap-fill answers must reach the resume').toEqual([])
        expect(report.gapsSurfaced).toBe(true)
        if (c.minRequirementCoverage != null) {
          expect(report.requirementCoverage).toBeGreaterThanOrEqual(c.minRequirementCoverage)
        }

        // --- L1: tailoring lift — re-score the draft with the same oracle ----------------------
        const draftFit = await analyzeResumeFit({ resumeText: resumeToMarkdown(resume), job: c.job, stories: allStories })
        const lift = draftFit.fitScore - baseline.fitScore
        // eslint-disable-next-line no-console
        console.log(`[eval] ${c.name}: baseline ${baseline.fitScore} → draft ${draftFit.fitScore} (lift ${lift >= 0 ? '+' : ''}${lift}); coverage ${(report.requirementCoverage * 100).toFixed(0)}%`)
        if (c.minLiftOverBaseline != null) {
          expect(lift, 'tailored draft should beat the stored resume').toBeGreaterThanOrEqual(c.minLiftOverBaseline)
        }

        // --- L3: LLM judge for voice / buzzwords / grounding ----------------------------------
        if (RUN_JUDGE) {
          const j = await judgeResume({ original: c.profile.resumeText, generated: resume, jobText: JSON.stringify(c.job) })
          // eslint-disable-next-line no-console
          console.log(`[eval] ${c.name}: judge voice=${j.voicePreserved} buzz=${j.buzzwordFree} tailored=${j.tailored} grounded=${j.grounded} — ${j.notes}`)
          expect(j.grounded, 'judge: grounded').toBeGreaterThanOrEqual(4)
          expect(j.voicePreserved, 'judge: voice preserved').toBeGreaterThanOrEqual(3)
        }
      },
      120_000,
    )
  }
})

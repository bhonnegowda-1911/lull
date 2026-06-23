import { describe, it, expect } from 'vitest'
import { PROMPTS, promptCatalog, getPrompt, DEFAULT_PROMPT } from '../data/prompts'

describe('behavioral question bank + JD selector catalog', () => {
  it('every bank prompt carries the prep guidance the plan/card render', () => {
    for (const p of PROMPTS) {
      expect(p.text).toBeTruthy()
      expect(p.assesses).toBeTruthy()
      expect(p.tip).toBeTruthy()
      expect(p.trap).toBeTruthy()
      expect(p.avoid).toBeTruthy()
    }
  })

  it('exposes a selector catalog whose ids all resolve back to real bank questions', () => {
    const catalog = promptCatalog()
    expect(catalog.length).toBe(PROMPTS.length)
    for (const c of catalog) {
      // The JD selector only returns catalog ids; each must resolve to that exact prompt.
      expect(getPrompt(c.id).id).toBe(c.id)
    }
  })

  it('falls back to the default prompt for unknown ids', () => {
    expect(getPrompt('nope').id).toBe(DEFAULT_PROMPT.id)
  })

  it('includes the startup-value archetypes the selector maps company values to', () => {
    for (const id of ['values-ai-assisted', 'values-open-source', 'values-bias-to-action', 'values-high-agency', 'values-customer-trust']) {
      expect(PROMPTS.some((p) => p.id === id)).toBe(true)
    }
  })

  it('has no duplicate prompt ids', () => {
    const ids = PROMPTS.map((p) => p.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})

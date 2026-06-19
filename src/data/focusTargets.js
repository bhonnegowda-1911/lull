// Phase 1: a static set of active focus targets, each with a `check(session)` that
// returns pass/fail for the current session. Phase 2 replaces this with an engine that
// derives, promotes, and retires targets from history.

export const ACTIVE_FOCUS_TARGETS = [
  {
    id: 'lead-with-outcome',
    label: 'Lead with the outcome',
    metric: 'leadsWithOutcome',
    check: (session) => {
      const lead = session?.llm?.raw?.deliveryHabits?.leadsWithOutcome
      if (!lead) return { status: 'unknown', detail: 'No analysis yet.' }
      return {
        status: lead.present && lead.score >= 4 ? 'pass' : 'fail',
        detail: lead.present ? `Stated up front (${lead.score}/5)` : 'Result was buried',
      }
    },
  },
  {
    id: 'detail-altitude',
    label: 'Keep detail at the right altitude',
    metric: 'detailAltitude',
    check: (session) => {
      const detail = session?.llm?.raw?.deliveryHabits?.detailAltitude
      if (!detail) return { status: 'unknown', detail: 'No analysis yet.' }
      const labels = { too_much: 'Too much detail', balanced: 'Right altitude', too_little: 'Too vague' }
      return {
        status: detail.tendency === 'balanced' && detail.score >= 3 ? 'pass' : 'fail',
        detail: labels[detail.tendency] || `Scored ${detail.score}/5`,
      }
    },
  },
  {
    id: 'fillers-under-6pm',
    label: 'Keep fillers under 6 per minute',
    metric: 'fillerRate',
    check: (session) => {
      const rate = session?.filler?.perMinute
      if (rate == null) return { status: 'unknown', detail: 'No filler data yet.' }
      return {
        status: rate <= 6 ? 'pass' : 'fail',
        detail: `${rate.toFixed(1)} per minute`,
      }
    },
  },
  {
    id: 'star-result-present',
    label: 'Always land a clear Result',
    metric: 'starResult',
    check: (session) => {
      const result = session?.llm?.raw?.perBeat?.result
      if (!result) return { status: 'unknown', detail: 'No analysis yet.' }
      return {
        status: result.present && result.score >= 3 ? 'pass' : 'fail',
        detail: result.present ? `Result scored ${result.score}/5` : 'No clear result stated',
      }
    },
  },
  {
    id: 'structure-3plus',
    label: 'STAR structure scores 3+',
    metric: 'structure',
    check: (session) => {
      const structure = session?.llm?.raw?.scores?.structure
      if (structure == null) return { status: 'unknown', detail: 'No analysis yet.' }
      return {
        status: structure >= 3 ? 'pass' : 'fail',
        detail: `Structure scored ${structure}/5`,
      }
    },
  },
]

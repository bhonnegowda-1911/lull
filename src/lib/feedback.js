// Merge the LLM analysis with the local filler result into one ranked, human-readable
// Feedback object. Pure function (no I/O, no second LLM call) — unit tested.

const SEVERITY_RANK = { high: 0, medium: 1, low: 2 }

/**
 * @param {object} args
 * @param {object} args.llm   AnalyzerResult from the criteria-driven LLM analyzer.
 * @param {object} args.filler AnalyzerResult from the filler analyzer.
 * @returns {object} Feedback
 */
export function buildFeedback({ llm, filler } = {}) {
  const star = llm?.raw || {}
  const fillerRaw = filler?.raw || {}

  // Rank LLM coaching notes by severity, then append a filler note as a derived finding.
  const notes = [...(star.coachingNotes || [])]
    .map((n) => ({ ...n, source: 'star' }))
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9))

  const fillerNote = deriveFillerNote(fillerRaw)
  if (fillerNote) notes.push(fillerNote)

  const beats = star.perBeat
    ? ['situation', 'task', 'action', 'result'].map((key) => ({
        key,
        label: key.charAt(0).toUpperCase() + key.slice(1),
        ...star.perBeat[key],
      }))
    : []

  return {
    conforms: Boolean(star.conforms),
    summary: star.summary || '',
    scores: star.scores || {},
    level: star.levelSignal || null,
    habits: star.deliveryHabits || null,
    beats,
    filler: {
      total: fillerRaw.total ?? 0,
      perMinute: fillerRaw.perMinute ?? null,
      byWord: fillerRaw.byWord || {},
    },
    notes,
  }
}

function deriveFillerNote(fillerRaw) {
  if (fillerRaw.perMinute == null) return null
  const rate = fillerRaw.perMinute
  let severity = 'low'
  if (rate > 10) severity = 'high'
  else if (rate > 6) severity = 'medium'
  if (severity === 'low' && fillerRaw.total <= 2) return null
  return {
    source: 'filler',
    severity,
    title: 'Filler-word usage',
    detail: `${fillerRaw.total} fillers (${rate.toFixed(1)}/min). ${
      severity === 'low'
        ? 'In a comfortable range — keep it up.'
        : 'Pausing silently instead of filling the gap will tighten your delivery.'
    }`,
  }
}

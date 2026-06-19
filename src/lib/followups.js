import { chatStructured } from './llmClient.js'

// Real interviewers probe. These two calls simulate that: generate follow-up questions
// tailored to what the candidate actually said, then briefly assess each spoken response.

const MODEL = 'claude-haiku-4-5'

const GENERATE_SYSTEM = `You are a sharp interviewer running a behavioral interview. Given
the question and the candidate's spoken answer, write 2-3 follow-up questions a strong
interviewer would actually ask next. Probe the weak or vague spots: their SPECIFIC personal
role ("what exactly did YOU do?"), tradeoffs and alternatives they skipped, missing metrics
or outcomes, and self-awareness ("what would you do differently?"). Each follow-up is one
sentence, conversational, and grounded in something they actually said. Do not re-ask the
original question.`

const GENERATE_SCHEMA = {
  type: 'object',
  properties: {
    followups: {
      type: 'array',
      description: '2-3 tailored follow-up questions, sharpest first.',
      items: {
        type: 'object',
        properties: {
          question: { type: 'string', description: 'The follow-up, one sentence.' },
          rationale: { type: 'string', description: 'Briefly, what this probes (for the candidate).' },
        },
        required: ['question', 'rationale'],
        additionalProperties: false,
      },
    },
  },
  required: ['followups'],
  additionalProperties: false,
}

const ASSESS_SYSTEM = `You are an interviewer assessing how well a candidate answered a
follow-up question. Judge only whether they answered THIS follow-up directly, specifically,
and concisely. Give a 1-5 score, whether they answered it head-on, and one concrete,
actionable tip. Be brief and honest.`

const ASSESS_SCHEMA = {
  type: 'object',
  properties: {
    answeredDirectly: { type: 'boolean', description: 'Did they answer the follow-up head-on?' },
    score: { type: 'integer', enum: [1, 2, 3, 4, 5], description: '1 (dodged/vague) to 5 (direct & specific).' },
    note: { type: 'string', description: 'One concrete, actionable tip.' },
  },
  required: ['answeredDirectly', 'score', 'note'],
  additionalProperties: false,
}

/**
 * Generate follow-up questions tailored to the candidate's answer.
 * @returns {Promise<Array<{ question: string, rationale: string }>>}
 */
export async function generateFollowups({ question, transcript, anthropicKey, signal }) {
  const user = [
    `ORIGINAL QUESTION:\n${question}`,
    '',
    `CANDIDATE'S ANSWER:\n${transcript?.text || '(empty)'}`,
  ].join('\n')

  const { parsed } = await chatStructured({
    provider: 'anthropic',
    model: MODEL,
    apiKey: anthropicKey,
    system: GENERATE_SYSTEM,
    user,
    schema: GENERATE_SCHEMA,
    maxTokens: 600,
    signal,
  })
  return parsed.followups || []
}

/**
 * Briefly assess a spoken answer to a follow-up question.
 * @returns {Promise<{ answeredDirectly: boolean, score: number, note: string }>}
 */
export async function assessFollowupAnswer({
  mainQuestion,
  followupQuestion,
  transcript,
  anthropicKey,
  signal,
}) {
  const user = [
    `ORIGINAL QUESTION:\n${mainQuestion}`,
    '',
    `FOLLOW-UP ASKED:\n${followupQuestion}`,
    '',
    `CANDIDATE'S RESPONSE:\n${transcript?.text || '(empty)'}`,
  ].join('\n')

  const { parsed } = await chatStructured({
    provider: 'anthropic',
    model: MODEL,
    apiKey: anthropicKey,
    system: ASSESS_SYSTEM,
    user,
    schema: ASSESS_SCHEMA,
    maxTokens: 400,
    signal,
  })
  return parsed
}

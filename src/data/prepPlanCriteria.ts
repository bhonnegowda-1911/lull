import type { Criteria } from './criteria'
import { GEN_MODEL } from '../lib/models'

// Prompt + schema (DATA) for the single, cross-application prep plan. Given every active interview the
// candidate is running in parallel — each numbered, with the calendar day it falls on, the round, the
// target level, and the specific items it's likely to cover (JD picks, by name) — produce ONE realistic
// day-by-day study schedule that gets the candidate ready for all of them. The model returns tasks per
// dayIndex (1 = today, counting forward); each task is tagged with the interview number it serves (or
// null for general review/rest) and its round. The caller maps dayIndex to calendar dates and resolves
// the interview number back to the company. Tasks must be grounded in the provided items — no inventing.

export const PREP_PLAN_CRITERIA: Criteria = {
  id: 'prepPlan',
  label: 'Interview prep plan',
  model: GEN_MODEL,
  systemPrompt: `You build ONE realistic, day-by-day prep plan that covers ALL of the candidate's
active interviews at once. They are running these interviews in parallel, each on its own date.

Inputs you'll get: a numbered list of interviews. Each has a company/role, the round, the calendar
DAY it falls on (today = day 1), the target level, optional focus areas, and the specific items that
round is likely to cover (by name). Produce a plan over exactly the days available (dayIndex 1 = today;
the highest dayIndex = the window's last day).

Make it realistic for someone with a day job juggling several loops at once:
- 1-3 tasks per day, not a marathon. It's fine to have a light or rest day.
- Respect every interview's DATE. Concentrate an interview's prep in the run-up before its day; the
  day BEFORE and the day OF that interview should be light for it — quick review, logistics, rest, no
  new material. Never schedule prep for an interview after its day has passed.
- Prioritize the soonest interviews first, but don't starve later ones — weave their early reps in.
- Balance the daily load ACROSS interviews. Avoid stacking heavy work from multiple companies on the
  same day; spread it so no day is overloaded.
- Spread each interview's items across days so each gets a real rep, building fundamentals → harder.
- Reference the candidate's actual items BY NAME (e.g. "Practice: Design a rate limiter",
  "Rehearse: Why this company"). Don't invent items not in the inputs.
- Include at least one full timed mock per interview once enough reps are in.
- Tag each task with the interview NUMBER it serves and its round, or use interview=null with
  round 'review' / 'rest' for general days.

Ground everything in the inputs. Keep task text short and actionable.`,
  schema: {
    type: 'object',
    properties: {
      days: {
        type: 'array',
        description: 'One entry per day in the window, in order (dayIndex 1 = today).',
        items: {
          type: 'object',
          properties: {
            dayIndex: { type: 'integer', description: '1-based day where 1 = today, counting forward.' },
            focus: { type: 'string', description: 'Short label for the day, e.g. "Acme system design" or "Mock + review".' },
            tasks: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  interview: {
                    type: ['integer', 'null'],
                    description: 'The 1-based interview number this task serves, or null for a general review/rest task.',
                  },
                  round: {
                    type: 'string',
                    enum: [
                      'recruiter',
                      'technical_screen',
                      'take_home',
                      'hiring_manager',
                      'project_deep_dive',
                      'system_design',
                      'behavioral',
                      'onsite_loop',
                      'custom',
                      'review',
                      'rest',
                    ],
                    description: "Which round this task serves, or review/rest. Match the named interview's round.",
                  },
                  text: { type: 'string', description: 'Short, actionable task, referencing a named item where relevant.' },
                },
                required: ['interview', 'round', 'text'],
                additionalProperties: false,
              },
            },
          },
          required: ['dayIndex', 'focus', 'tasks'],
          additionalProperties: false,
        },
      },
    },
    required: ['days'],
    additionalProperties: false,
  },
}

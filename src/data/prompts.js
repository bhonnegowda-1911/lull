// The most common behavioral interview questions, grouped by competency. Fixed wording so
// sessions on the same prompt are comparable over time. Each carries `assesses` (what the
// interviewer is really evaluating) and `tip` (one specific pointer) for prep.

// A reusable way to think through ANY behavioral answer. Ordered. The outcome-first step
// is deliberately near the top — burying the result is the most common delivery mistake.
export const ANSWER_FRAMEWORK = [
  'Pick a story with a real, concrete outcome — ideally one you can put a number on.',
  'Lead with the headline. Open with the result/impact in one sentence, THEN tell the story. Don’t make them wait for the payoff.',
  'Set the scene fast: 1–2 sentences of Situation + Task. Just enough context, no scene-painting.',
  'Spend most of your time on YOUR Actions — the decisions and tradeoffs you made (say “I”, not “we”). Stay at the altitude of decisions, not every step.',
  'Close the loop: state the Result, tie it back to your opening headline, and add one sentence on what you learned.',
  'Aim for ~2 minutes. If you’re past 3, you’re over-detailing.',
]

export const PROMPTS = [
  // Conflict & disagreement
  {
    id: 'conflict-teammate',
    category: 'Conflict',
    label: 'Disagreement with a teammate',
    text: 'Tell me about a time you disagreed with a teammate. What was the situation, what did you do, and how did it turn out?',
    assesses: 'Whether you can disagree without damaging the relationship, and reach a good outcome.',
    tip: 'Show you sought to understand their view first; end on the resolution and what it produced, not the friction.',
  },
  {
    id: 'conflict-manager',
    category: 'Conflict',
    label: 'Disagreement with your manager',
    text: "Describe a time you disagreed with your manager's decision. What did you do, and what was the result?",
    assesses: 'Backbone plus judgment — can you push back respectfully and then commit.',
    tip: 'Lead with the outcome, then how you raised the disagreement with data and disagreed-and-committed.',
  },

  // Failure & mistakes
  {
    id: 'failure-project',
    category: 'Failure & mistakes',
    label: 'A project that failed',
    text: 'Describe a time a project of yours failed or missed its goal. What happened and what did you learn?',
    assesses: 'Ownership and growth — do you take responsibility and extract a real lesson.',
    tip: 'Own your part without over-apologizing; spend the most time on what you changed afterward.',
  },
  {
    id: 'mistake-owned',
    category: 'Failure & mistakes',
    label: 'A significant mistake',
    text: 'Tell me about a significant mistake you made at work. How did you handle it and what changed afterward?',
    assesses: 'Accountability and how you respond under your own error.',
    tip: 'State the impact up front, then the fix and the systemic change so it can’t recur.',
  },

  // Leadership & influence
  {
    id: 'leadership-led',
    category: 'Leadership & influence',
    label: 'Leading a project or team',
    text: 'Give an example of a time you took the lead on something. What did you do and what was the result?',
    assesses: 'Initiative, coordination, and the scope of impact you can drive.',
    tip: 'Lead with the result and your scope; then how you set direction and unblocked others.',
  },
  {
    id: 'influence-no-authority',
    category: 'Leadership & influence',
    label: 'Influencing without authority',
    text: 'Describe a time you had to influence people or drive a decision without formal authority over them.',
    assesses: 'Persuasion, building coalitions, and earning trust.',
    tip: 'Focus on how you understood their incentives and won them over — name the decision that resulted.',
  },

  // Teamwork & collaboration
  {
    id: 'teamwork-difficult',
    category: 'Teamwork',
    label: 'A difficult teammate',
    text: 'Tell me about a time you had to work closely with someone difficult. How did you make it work?',
    assesses: 'Empathy and professionalism under interpersonal friction.',
    tip: 'Stay generous about the other person; show what you changed in your own approach.',
  },

  // Ambiguity & decisions
  {
    id: 'ambiguity-decision',
    category: 'Ambiguity & judgment',
    label: 'Deciding with incomplete info',
    text: 'Describe a time you had to make an important decision with incomplete information. How did you approach it?',
    assesses: 'Judgment, bias for action, and how you reason under uncertainty.',
    tip: 'Name the result first; then the few signals you weighed and why you decided when you did.',
  },
  {
    id: 'complex-project',
    category: 'Ambiguity & judgment',
    label: 'Most complex project you drove',
    text: 'Walk me through the most complex or ambiguous project you owned end to end. What made it hard and what did you do?',
    assesses: 'Scope, ownership, and how you break down hard problems.',
    tip: 'Resist narrating every detail — give the outcome, then the 2–3 hardest decisions you made.',
  },

  // Execution & pressure
  {
    id: 'deadline-pressure',
    category: 'Execution',
    label: 'Delivering under pressure',
    text: 'Tell me about a time you had to deliver something important under a tight deadline.',
    assesses: 'Prioritization and composure when the clock is against you.',
    tip: 'Lead with whether you delivered; then how you cut scope or sequenced work to get there.',
  },
  {
    id: 'competing-priorities',
    category: 'Execution',
    label: 'Competing priorities',
    text: 'Describe a time you had to juggle competing priorities. How did you decide what to do first?',
    assesses: 'Decision-making and how you reason about tradeoffs.',
    tip: 'Make the decision criteria explicit (impact, urgency, who you consulted), not just the busywork.',
  },
  {
    id: 'initiative-above-beyond',
    category: 'Execution',
    label: 'Going above and beyond',
    text: 'Tell me about a time you went beyond what was expected of you. What drove you and what was the impact?',
    assesses: 'Ownership and intrinsic drive.',
    tip: 'Anchor on the impact; make clear it was self-initiated, not assigned.',
  },

  // Growth & feedback
  {
    id: 'feedback-received',
    category: 'Growth & feedback',
    label: 'Receiving hard feedback',
    text: 'Describe a time you received difficult feedback. How did you respond and what did you change?',
    assesses: 'Self-awareness and coachability.',
    tip: 'Don’t get defensive in the retelling; spend the time on the concrete change you made.',
  },
  {
    id: 'feedback-given',
    category: 'Growth & feedback',
    label: 'Giving hard feedback',
    text: 'Tell me about a time you had to give critical feedback to a peer or report. How did you handle it?',
    assesses: 'Directness with care, and whether it landed.',
    tip: 'Show you were specific and kind; end with how the person/outcome improved.',
  },
  {
    id: 'learn-fast',
    category: 'Growth & feedback',
    label: 'Learning something quickly',
    text: 'Tell me about a time you had to get up to speed on something unfamiliar very quickly.',
    assesses: 'Learning agility and resourcefulness.',
    tip: 'Lead with what you shipped/achieved; then the method you used to ramp fast.',
  },

  // Impact
  {
    id: 'proudest-accomplishment',
    category: 'Impact',
    label: 'Proudest accomplishment',
    text: "What's the accomplishment you're most proud of, and what was your specific contribution?",
    assesses: 'What you value, and your real (vs. team) contribution.',
    tip: 'Open with the impact and your specific role; be precise about what was YOURS.',
  },
  {
    id: 'stakeholder-unhappy',
    category: 'Impact',
    label: 'An unhappy stakeholder',
    text: 'Describe a time you turned around an unhappy customer or stakeholder. What did you do?',
    assesses: 'Composure, empathy, and recovery.',
    tip: 'State where it ended up first (recovered the relationship/deal), then how you got there.',
  },

  // Non-technical stakeholders
  {
    id: 'stakeholder-explain-technical',
    category: 'Non-technical stakeholders',
    label: 'Explaining something technical',
    text: 'Tell me about a time you had to explain a complex technical concept or tradeoff to a non-technical audience. How did you get the point across?',
    assesses: 'Communication — translating technical depth into business terms.',
    tip: 'Lead with whether they understood/decided well; then the analogy or framing you used.',
  },
  {
    id: 'stakeholder-manage-expectations',
    category: 'Non-technical stakeholders',
    label: 'Managing expectations',
    text: 'Describe a time a non-technical stakeholder expected something that was not feasible (timeline, scope, or cost). How did you handle it?',
    assesses: 'Honesty, framing tradeoffs, and protecting trust.',
    tip: 'Show how you reframed in their terms (cost/risk/value) and offered options, not just “no”.',
  },
  {
    id: 'stakeholder-say-no',
    category: 'Non-technical stakeholders',
    label: 'Pushing back on a request',
    text: 'Tell me about a time you had to say no to, or redirect, a request from a business or product stakeholder. How did you keep the relationship intact?',
    assesses: 'Backbone plus diplomacy with cross-functional partners.',
    tip: 'Make the “why” about shared goals; end on the alternative you aligned on.',
  },
  {
    id: 'stakeholder-align',
    category: 'Non-technical stakeholders',
    label: 'Aligning conflicting stakeholders',
    text: 'Describe a time you had to align stakeholders from different functions (e.g. product, sales, design) who wanted different things. How did you reach a decision?',
    assesses: 'Facilitation and driving to a decision across competing interests.',
    tip: 'Name the decision and outcome first; then how you surfaced tradeoffs and built consensus.',
  },
]

export const DEFAULT_PROMPT = PROMPTS[0]

// Stable category order for grouping in the picker.
export const PROMPT_CATEGORIES = PROMPTS.reduce((acc, p) => {
  if (!acc.includes(p.category)) acc.push(p.category)
  return acc
}, [])

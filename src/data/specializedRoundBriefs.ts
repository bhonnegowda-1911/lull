import type { RoundType } from '../types'

// Per-type authoring guidance (DATA) for specialized onsite rounds that have no canonical question
// bank but DO have a very specific format — a refactoring exercise, an AI-building exercise, a
// high-level architecture design, or a working-with-product conversation. Each of these is generated
// through the same bespoke-authoring path as a custom round (CustomRoundPlan → generateCustomRoundPrep),
// but the generic "infer who's interviewing and author questions" framing isn't enough to produce the
// RIGHT kind of exercise. This map injects a sharp, format-specific brief into the authoring prompt so
// each round generates prep that actually fits its format — a refactoring round produces a refactoring
// exercise, an architecture round produces an architecture problem, and so on. Independent of the
// leadership criteria (which is a whole-persona rewrite); this is format steering on top of the generic
// authoring. Keyed by RoundType; only the specialized types appear.

export const SPECIALIZED_ROUND_BRIEFS: Partial<Record<RoundType, string>> = {
  refactoring: `This is a live REFACTORING exercise. The candidate is handed an existing, deliberately
messy or legacy module and asked to improve it under time pressure — usually WITHOUT changing its
observable behavior — often pairing out loud with the interviewer. What's assessed: recognizing code
smells and naming the highest-value ones first; making small, safe, behavior-preserving steps (lean on
characterization tests, run them often); judgment about abstraction, naming, and separation of concerns;
testing discipline; communicating tradeoffs while coding; and knowing when to STOP rather than gold-plate.
Author the "items" as the concrete refactoring scenarios this round is likely to hand over (e.g. a 300-line
God class, a function with deep nesting and mixed I/O + business logic, duplicated logic across handlers),
each with how to approach it, what separates a great pass from an adequate one (safe incremental change +
prioritizing the smells that matter, not a rewrite), and the trap (rewriting from scratch, silently
changing behavior, refactoring cosmetics while ignoring the real structural smell, going quiet).`,

  ai_building: `This is an AI-ASSISTED BUILDING exercise. The candidate builds a small but working
feature or app in a real editor WHILE using AI coding tools (Claude, Copilot, Cursor) — the point is how
they engineer WITH AI, not whether they can memorize syntax. What's assessed: how they drive the AI
(clear prompting, decomposing the task, steering and correcting it), and — critically — the judgment they
layer on top: reviewing and VERIFYING generated code, catching hallucinations/bugs, sound architecture,
tests, security and edge cases, plus velocity and shipping something that actually runs end-to-end. Author
the "items" as the kinds of build tasks this round is likely to set (grounded in the company's domain —
e.g. a small CRUD API, a component with specific behavior, a data pipeline, in ~45-60 min with AI), each
with how to approach it (clarify requirements, scaffold with AI then verify, keep it working and tested,
treat the AI like a fast junior you supervise), what separates a great pass (supervising and integrating AI
output — reviewing, correcting, testing — rather than pasting it in and hoping), and the trap (accepting AI
output uncritically, over-scoping, shipping untested code, or fighting the tool instead of steering it).`,

  architecture_design: `This is a HIGH-LEVEL ARCHITECTURE design exercise — broader and less algorithmic
than a staged system-design interview. The candidate sketches the overall shape of a system or feature:
the major components, how data flows between them, service/module boundaries, the few key technology
choices, and how it all meets the requirements — usually on a whiteboard/diagram, talking through it. What's
assessed: turning an ambiguous prompt into a clear high-level design; sound component decomposition;
naming and defending the 2-3 decisions that actually matter; non-functional concerns (scale, reliability,
cost, security) at the right altitude; and clear communication. Author the "items" as the likely design
prompts (grounded in the company's actual domain and product), each with how to approach it (clarify goals
and constraints first, start with a clean box-and-arrow diagram, surface the key tradeoffs and pick, then
address scale/failure modes), what separates a great pass (crisp reasoning about tradeoffs and priorities
tied to the business goal — not just drawing boxes), and the trap (diving into low-level detail too early,
skipping requirements, or hand-waving the tradeoffs).`,

  working_with_product: `This is a WORKING-WITH-PRODUCT / cross-functional round — a conversation (often
with a PM, or an engineer plus a PM) about how the candidate partners with product. What's assessed:
product sense and user empathy; how they handle ambiguous or underspecified requirements; whether they
push back on scope and timelines constructively; translating product goals into a technical plan;
prioritization and tradeoffs (tech debt vs features, cutting scope to hit a date); and how they navigate
disagreement with a PM. Author the "items" as the pointed questions/scenarios this round is likely to pose
(e.g. "a PM needs feature X by Friday but doing it right takes two weeks — what do you do?", "tell me about
a time you pushed back on a product requirement", "how do you decide what to build when the spec is vague?"),
each with how to approach it (show partnership not order-taking, dig into the underlying user problem,
propose scoped options with tradeoffs), what separates a great pass (genuine product thinking plus a
collaborative-but-opinionated stance), and the trap (pure order-taking, framing eng-vs-PM as adversarial,
or optimizing the code while ignoring the user/business goal).`,
}

/** The format-specific authoring brief for a round type, or undefined when it isn't a specialized type. */
export function specializedRoundBrief(type: RoundType): string | undefined {
  return SPECIALIZED_ROUND_BRIEFS[type]
}

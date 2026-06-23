# Interview Coach — PRD (lean working doc)

**Type:** Living working doc — guides what to build/cut next. Not a portfolio piece.
**User:** One person (me). Single-user, private practice.
**North star:** *I get measurably better at interviews over repeated reps.*
**Last updated:** 2026-06-21 (added Prep ground-truth hub + resume↔JD fit; backend LLM gateway shipped)

> This doc owns **why** and **what**. The **how** (stack, routes, models) lives in
> the README and the code — don't duplicate it here.

---

## 1. Problem

I'm prepping for **learn-and-ship startup backend roles** — concretely, teams
like Comfy (ComfyUI / Comfy Cloud), whose bar is explicit: *"we care way more
about your ability to learn and ship than whether you've used these exact
languages before."* (Stack: Python, Go, Kubernetes, Postgres — but stack-agnostic
hiring.) The app already carries the "Comfy Cloud" system-design problem.

Practicing for these solo fails three ways:
1. **No honest signal** — I can't grade my own answer, and friends won't tell me
   I sound like a mid-level engineer.
2. **Delivery is invisible to me** — I don't hear my own filler, I ramble past
   the point, I bury the outcome.
3. **Each round needs a different muscle** — STAR storytelling, structured
   tradeoff reasoning, and prioritization-under-a-clock don't improve together.

**The bar vs. what the app trains:** "learn and ship" is the hiring signal, but
the modes train the interview *rounds*. Ship is only rehearsed as a *plan* (Build
mode doesn't run code); **learn** (ramping fast on an unfamiliar codebase) isn't
trained at all. See open questions §8.

---

## 2. North star & success metrics

**North star:** measurable personal improvement over reps.

A rep "counts" only if it produces a comparable score, so trends are visible:

| Metric | Target direction | How measured |
|--------|------------------|--------------|
| Filler words / min | ↓ over sessions | local analyzer |
| STAR clarity / structure / impact | ↑ over sessions | LLM grading |
| Level signal (per mode) | trends toward target level | LLM grading |
| Rep cadence | sustained (e.g. N/week) | session history |
| Completion rate | started → graded stays high | session history |

**Implication:** the highest-value missing feature is **trend tracking over
time** — without it, "am I improving?" is unanswerable, which is the whole point.

---

## 3. Non-goals (what I will NOT build)

- Not a job tracker or scheduler.
- **Revised 2026-06-21:** resume work *is now in scope*, but narrowly — a resume↔JD **fit
  analyzer** (shipped) and a JD-targeted **generator grounded in my own projects/stories**
  (Phase 2). A generic, ungrounded "resume builder" remains a non-goal.
- Not multiplayer / peer-mock — single-user only.
- Build mode does **not** run or grade my code — it coaches the *plan*.
- No public launch / multi-user auth until the personal loop is proven valuable.
- No generic "improve" features that don't move a metric in §2.

---

## 4. Users & top use cases

One user (me). Top jobs, in priority order:
1. Do a timed behavioral rep and see if my delivery is improving. **(P0)**
2. Do a staged system-design interview and get a level signal + what's missing. **(P0)**
3. Pressure-test my plan for a timed build challenge before doing it for real. **(P1)**
4. Look back across sessions and see the trend. **(P0 — currently weakest)**

---

## 5. Requirements (outcome-focused, prioritized)

### Behavioral — P0
- Record/upload an answer; transcribe it.
- Grade STAR (per-beat), clarity/structure/impact, filler rate, delivery habits.
- Return a **level signal** + concrete "to reach the next level" guidance.
- Generate realistic follow-ups.

### System Design — P0
- Staged interview (functional → NFR → entities → API → data flow → high-level →
  deep dives) with a live interviewer and per-stage time budgets.
- Attach diagrams/whiteboard media to a stage.
- Final **leveling report** graded against each stage's rubric.

### Build — P1
- Staged *planning* conversation (scope → running core → risks/approach) that
  pressure-tests prioritization, with curveballs.
- Final report scored on prioritization rubric dimensions.

### Progress / History — P0 (under-built)
- Durable, replayable session history across modes.
- **MISSING:** trend visualization over time (the north-star feature).
- **MISSING (Phase 2):** focus targets auto-derived from my own history.

---

## 6. Key decisions & tradeoffs  *(DRAFT — confirm/correct the reasoning)*

The high-signal section. What was chosen, and what we gave up:

| Decision | Why | What we traded away |
|----------|-----|---------------------|
| Build mode coaches the *plan*, doesn't run code | Keeps a rep to ~15 min of prioritization practice, not a build harness | Doesn't verify the code actually works |
| Rubrics as data, not prose in prompts | Swap frameworks/levels in one place; same rubric drives interviewer + grading | Someone must author & maintain rubric quality |
| Server LLM gateway, keys server-side (shipped) | Keys never in the browser; one chokepoint for usage/cost | A backend must run for any LLM call |
| Sonnet for turns, Opus for the final report | Pay for top judgment only where it matters most | Higher cost/latency on the report |
| localStorage fallback when backend offline | Reps never blocked by infra | Two sources of truth to reconcile |

*If any of these "why"s are wrong or post-hoc, fix them — a tradeoff I can't
defend is one I should revisit.*

---

## 7. What's next (driven by §2, not by what's fun to build)

1. **Trend tracking** — make improvement visible. Highest leverage; unlocks the
   north star. **(P0)**
2. Auto-derived focus targets from history. **(P1)**
3. **Compare/history view for generated resumes** — drafts persist as `resume_gen` sessions, but
   there's no UI to list/diff versions yet. **(P2)**

*Done since last revision: conversational STAR **story** builder (coach-guided, voice-enabled),
with the takeaway/"so what" added to the story model; **JD-targeted resume generation (Phase 2)** —
grounded in stories/projects, with per-bullet provenance and a fit-delta loop (see
[`docs/PHASE2-resume-generation.md`](docs/PHASE2-resume-generation.md)); voice input across project
and story capture; **JD-driven interview loop** — from a target job, predict and rank the likely
**system-design problems** and **behavioral/managerial questions**, each with a domain/value
rationale and a one-click **Practice →** into the real round. Both selectors choose only from the
curated catalogs (problem library expanded to ~32 canonical problems; behavioral bank gained a
"Startup fit & values" set), so grading stays anchored — the LLM matches and explains, it never
invents the question or the answer key. Also: LLM gateway now **retries transient overloads**
(429/5xx/529) with backoff, and Prep tabs keep in-progress work alive across tab switches.*

---

## 8. Open questions

- **Does the "learn and ship" bar break Build mode's plan-only scope?** If the
  interview tests *shipping*, is rehearsing only the *plan* enough — or should
  Build mode actually exercise shipping a slice? (Revisits §6 tradeoff.)
- **Should there be a "learn" mode?** Nothing trains ramping fast on an
  unfamiliar codebase / making a change in a large OSS repo (e.g. ComfyUI).
  Deliberate non-goal, or the next mode?
- Is "level" one ladder across all three modes, or per-mode?
- What's a *credible* level signal — how do I trust the LLM's grade enough to act
  on the trend? (calibration / consistency)
- Retention: how long do I keep recordings & transcripts?
- Should follow-ups become multi-turn rather than one generated round?

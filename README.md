# Lull

*Quiet the noise before the interview.*

A personal, single-user web app to run your whole interview pipeline. The home (**Pipeline**) is a
cross-company dashboard: every application as a journey card plus one **unified agenda** that merges
each active round's countdown plan by date. Each application opens a **journey** (`/app/:id`) —
*am I a fit?* (resume↔JD fit) → *tailor a resume & apply* → *build the interview loop* (a
configurable, reorderable set of rounds, each with its own date, topic, and focus areas) →
*phased prep* for the active round that unlocks as you pass each phase and works backward from its
date. A **Library** holds the ground truth (resume, projects, story bank, target jobs), and four
**Practice** modes are reached both directly and via one-click **Practice →** deep-links from a
round's predicted questions/problems: **Behavioral** (record/upload an answer → LLM-graded delivery:
STAR, clarity, filler rate, level signal), **Coding** (staged problem-solving interview + leveling
report), **System Design** (staged interview + leveling report), and **Build** (timed prioritization
coach). Two read-only views close the loop: **Progress** charts whether your level is rising across
reps, and **Outcomes** (`/metrics`) checks whether the scores actually predict real interview
results (see _Outcomes & metrics_ below).

The UI is responsive (a hamburger nav on phones), keyboard-reachable, and uses tasteful motion +
celebration moments; it honors `prefers-reduced-motion`.

## How it works (behavioral loop)

```
Recorder ─▶ blob (audio|video)
   ─▶ Whisper transcription ─▶ transcript
        ├─ fillerAnalyzer (local heuristic)  ─▶ counts + per-minute rate
        └─ llmAnalyzer (Claude, STAR rubric) ─▶ structured feedback
   ─▶ merged Feedback ─▶ feedback + replay + focus targets
```

- **Transcription:** OpenAI Whisper (`whisper-1`).
- **Grading:** Claude Opus 4.8 with a fixed STAR rubric via structured outputs, behind a
  provider-agnostic `llmClient` (an OpenAI adapter slot is stubbed for later). Model selection is
  centralized in `src/lib/models.ts`.
- **LLM gateway:** all model calls go through the Node/Express backend (`/api/llm/*`), so your
  **OpenAI/Anthropic keys live only on the server**, never in the browser. Prompt + schema
  construction stays client-side; the gateway just forwards — and **retries transient upstream
  errors** (429/5xx/529 "Overloaded") with exponential backoff so a busy model doesn't fail a rep.

## Pipeline, journey & the Library

The home **Pipeline** (`/`) lists every application and a **unified, cross-company agenda** built by
a pure module (`src/lib/application/agenda.ts`): it merges each active round's countdown plan by
date, tags each task with its company, and flags heavy days so parallel loops stay balanced.

Opening a card enters that application's **journey** (`src/features/prep/ApplicationJourney.tsx`,
route `/app/:id`) — a top-to-bottom stepper:

1. **Am I a fit?** — score your resume + stories against the role (`FitStep`); a **fit score +
   structured gaps** (never a binary), each gap tagged *Reword* / *Add a story* / *Real gap*. The
   verdict snapshot persists on the application.
2. **Tailor a resume & apply** — generate a resume grounded strictly in your stories/projects,
   tailored to the JD, with per-bullet provenance (`ResumeStep`); mark the application applied.
3. **Interview loop** — a **per-application, configurable** ordered set of rounds (`LoopStep`),
   each a `RoundType` from the catalog (`src/data/rounds.ts`): recruiter, technical screen,
   take-home, hiring manager, project deep-dive, system design, behavioral, onsite loop, custom.
   Add/remove/reorder them, and set each round's **date/time, topic, focus areas, and outcome**
   (interviews reschedule freely — moving a date re-sorts the agenda and flags a stale plan).
4. **Phased prep** — for the **active round only** (the first not passed/failed), predict its likely
   items from the curated catalogs and build a **day-by-day countdown** working back from its date,
   grounded in the round's topic/focus areas (`RoundPrep`). Marking the round *passed* unlocks the
   next phase. (No calendar/Gmail sync yet — the round model already carries the fields a future
   Google importer would fill.)

The **Library** (`/library`) holds the ground-truth tiers the journey and practice modes draw on, as
tabs:

- **Resume** — your resume text + target level; can bootstrap skeleton projects from it.
- **Projects** — the deep, level-aware ground truth, captured per **competency facet**
  (hardest-part-technically, ambiguity, influence, ownership, …). Each facet is built as a
  **conversational STAR interview** with the coach (not a textarea); in-progress drafts persist
  to both `localStorage` and Postgres (`facet_drafts`), so a half-built answer survives reloads
  and follows you across devices.
- **Stories** — answer-shaped STAR stories mined from projects; the coaching grader reads them.
- **Jobs** — paste a target job description; it's parsed once into structure (skills, seniority,
  ATS keywords) and stored. A stored job is what each Pipeline application is built on.

### JD-driven interview loop

A company rarely invents a bespoke question per candidate — it reaches for a **canonical** problem
whose complexity matches the business it runs, and probes the **values** it states. Inside a round's
**phased prep** (`RoundPrep`), the catalog picks which selector runs for the active round and
predicts its likely items, ranked with a domain/value **rationale**:

- **System-design round** — ranks the curated problem library (`src/data/sysdesign/problems.ts`,
  ~32 canonical problems: URL shortener, rate limiter, code-execution sandbox, webhook delivery,
  Dropbox, ad-click aggregator, …) by how likely the company is to ask each. The LLM only *matches
  and explains* — it never invents a problem or a grading key, so grading stays on each problem's
  hand-authored hints. (e.g. an identity-security integration platform → a LeetCode-style
  code-execution sandbox + reliable webhook delivery.)
- **Behavioral / managerial round** — ranks the curated question bank (`src/data/prompts.ts`) by
  the values the JD states (*"Ship, ship, ship"* → the ship-fast question; *"Build with AI"* → the
  AI-tools question; *Compassionate Candor* → the hard-feedback question), each mapped to its
  source value.

Both selectors are **prompt + schema data** (`src/data/sysdesign/genCriteria.ts`,
`src/data/behavioralCriteria.ts`) and return only ids from the curated catalogs. Saved picks
persist on the job; each recommended item has a **Practice →** button that jumps straight to the
System Design or Behavioral practice mode with the problem/question loaded.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests for the pure logic
npm run typecheck  # tsc -b, no emit
npm run build      # type-checks, then bundles
```

> **Note:** if your system Node is broken (Homebrew `icu4c` mismatch), a self-contained
> Node is bundled in `.toolchain/` (gitignored). Use the `./dev.sh` wrapper, which puts it
> first on PATH and forwards to npm: `./dev.sh`, `./dev.sh build`, `./dev.sh test`.

### Running with the backend (durable sessions + media)

Sessions and media (voice recordings, system-design images/video) persist to a backend:
**Postgres** for structured data + jsonb session payloads, **MinIO** (S3-compatible) for
binaries, and a small **Node/Express** service that also proxies all LLM calls — so your
**OpenAI/Anthropic keys now live only on the server**, not in the browser.

```bash
docker compose up -d                 # Postgres + MinIO (+ Adminer on :8081, MinIO console :9001)

cp server/.env.example server/.env   # then add your ANTHROPIC_API_KEY / OPENAI_API_KEY
./dev.sh server:install              # install backend deps (one time)
./dev.sh server                      # API on http://localhost:8787

./dev.sh                             # Vite on http://localhost:5173 (proxies /api → :8787)
```

The app falls back to its in-browser localStorage cache if the backend is unreachable, but
durable history and media require the services above.

## Outcomes & metrics

A personal **Outcomes** dashboard (`/metrics`, `src/features/metrics/`) charts whether prep shows up
in real results, computed from a local append-only event log (`src/lib/metrics/`): the **pipeline
funnel** (applied → interviewing → passed → offer), **real-round pass rates** overall and per practice
mode, **fit-score calibration** (does an "80" actually pass ~80% of the time?), and **practice payoff**
(pass rate when you practiced the matching mode vs not). Every stat shows its sample size; calibration
and lift are explicitly framed as small-N / correlational, not causal. Capture is wired at the
round-outcome (`LoopStep`) and session-completion points and never blocks a flow.

### TODO — business / cross-user metrics

The dashboard above is **single-user** by design. Productizing the "our scores predict outcomes"
claim needs aggregate analytics, which is not built:

- [ ] **Anonymous telemetry sink** — a backend endpoint behind `VITE_METRICS_SINK_URL` (the stub is in
  `events.ts`) that receives only `{prediction, outcome}` pairs, never resume/PII. Required because one
  user's N is too small to trust.
- [ ] **Aggregate validity reporting** — cross-user calibration + predictive-validity (AUC/lift) so the
  product can credibly say "Gold in System Design → X% real pass rate."
- [ ] **Activation & retention metrics** — time-to-first-value, corpus depth (projects/stories per
  user), W1/W4 retention — to measure and attack the cold-start problem.
- [ ] **Causal attribution** — a holdout or pre/post design; today's practice-lift is correlational.

## Product notes (pros / cons)

What this app captures that point tools don't, and where it's weak — useful context for any
productization decision.

**Pros**

- **One integrated pipeline, not a point tool.** Track → fit-score → tailor resume → build the loop →
  mode-specific practice → outcomes, with one cross-company agenda. Competitors own a single slice
  (tracking *or* resume *or* coding *or* mocks).
- **A compounding personal corpus with provenance.** Resume/projects/stories are captured once and
  reused everywhere; every resume bullet traces to a source, so it structurally can't fabricate.
- **The JD threads through everything** — fit gaps (reword / add-story / real-gap), a resume tailored to
  it, and grading against that company's bar.
- **Breadth of practice** — behavioral + coding + system design + build (wider than typical AI mocks).
- **Owns both sides of the validation join** — it records predictions *and* real outcomes, so it can
  prove its scores predict results (see Outcomes above). Most tools never see the interview result.
- **Privacy / local-first** — career data and recordings stay on the user's machine; LLM keys live only
  on the server.

**Cons**

- **No auth / no multi-tenancy.** There is **no authentication or authorization** — it's a single-user
  app with no login, no per-user isolation, no access control. Any multi-user/hosted offering needs
  this built from scratch (and it gates the telemetry sink, sharing, and team features).
- **Cold-start friction.** The corpus that makes it special is also what users must grind through before
  any payoff — the moat and the churn risk are the same feature.
- **Local-first is also a liability** — single-device, no sync/cloud backup by default, durable history
  needs the backend running.
- **No human / no credibility network.** Pramp/interviewing.io carry weight via real interviewers; LLM
  "rank"/"fit" scores feel arbitrary until validated against outcomes (the Outcomes work is the answer,
  but needs aggregate data).
- **Narrow ICP** — heavily SWE / backend-leaning; smaller TAM, unproven outside that.
- **Thin content + no AI moat** — small problem banks vs LeetCode; anyone can call the same models, so
  defensibility has to be the workflow + corpus.
- **Short LTV** — interview prep is bursty; users churn the day they sign an offer.

## Project structure

A layered, feature-oriented layout — UI never talks to the network or a model directly; it goes
through `lib/`, and prompts/rubrics/problem banks are **data**, not code:

```
src/
  data/        Domain data + LLM contracts as values: prompts, STAR/fit/coding/sysdesign
               criteria (prompt + JSON schema), curated problem banks, rounds catalog.
  lib/         Pure logic + side-effect clients, framework-free:
    api.ts        single source of truth for the API base URL
    llmClient.ts  provider-agnostic structured-output gateway (→ /api/llm)
    *Store.ts     per-domain persistence clients (jobs, sessions, profile, stories, …)
    application/  agenda + schedule (pure, unit-tested)
    coding|sysdesign|build/  per-mode conversation + report logic
    metrics/      events (capture) + compute (pure funnel/calibration/validity)
    ui/           shared motion presets + confetti helpers
  features/    Route-level screens grouped by domain (pipeline, prep, progress,
               metrics, history, stories) — composition, state, and data wiring.
  components/  Reusable / mode-specific presentational pieces (Recorder, Logo,
               EmptyState, the coding/sysdesign/build session shells).
  context/     React context providers (API-key/config).
  test/        Vitest suites — one per pure lib area (14 files).
server/src/    Modular monolith: one Express router per domain under /api
               (sessions, assets, llm, profile, projects, stories, jobs, …).
```

**Conventions worth knowing**

- **Data-as-contract.** Every LLM call is `chatStructured()` over a `Criteria` value (prompt +
  schema). Adding a capability = adding data, not plumbing; schemas are guarded by a unit test.
- **Pure core, tested.** Scoring, agenda merging, trends, and metrics are pure functions with no
  React/network deps — that's the test seam (LLM/IO is mocked or left out).
- **Graceful degradation.** Stores fall back to a localStorage cache (or empty) when the backend is
  down, so practice is never blocked by infra.
- **Strict & quiet.** `strict` TS with `noUnusedLocals/Parameters`; no `as any`, no `@ts-ignore`,
  no stray `console.*`.

> **Note on naming:** the product is **Lull**, but a few internal identifiers (the `deliveryCoach.*`
> localStorage cache keys) keep the old codename on purpose — renaming them would orphan a user's
> existing cached data.

## Tech

Vite + React 18 + **TypeScript** (strict), Tailwind CSS v4, framer-motion + lucide-react +
canvas-confetti for the UI, Vitest for tests, `@react-pdf/renderer` for resume export. Backend:
Node/Express + Postgres + MinIO, a modular monolith where each feature is a router under `/api`
(`sessions`, `assets`, `llm`, `profile`, `projects`, `stories`, `facet-drafts`, `jobs`).
Shared domain types live in `src/types.ts`; system-design types sit next to their modules in
`src/{data,lib}/sysdesign`. Analyzers conform to one interface and the prompts/rubrics/selectors are
**data** (`src/data/criteria.ts`, `src/data/resumeCriteria.ts`, `src/data/sysdesign/genCriteria.ts`,
`src/data/behavioralCriteria.ts`), so swapping STAR for another framework, extending the problem
library, or adding a JD selector needs no UI/analyzer rework.

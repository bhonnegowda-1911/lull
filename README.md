# Delivery Coach

A personal, single-user web app to practice interviews and build the ground truth behind your
answers. Three practice modes — **Behavioral** (record/upload an answer → LLM-graded delivery:
STAR, clarity, filler rate, level signal), **System Design** (staged interview + leveling
report), and **Build** (timed prioritization coach) — plus a **Prep** hub that holds your
resume, projects, story bank, target jobs, a resume↔job-description fit analyzer, and a
**JD-driven interview loop** that predicts the system-design problems and behavioral questions a
specific company is likely to ask — then lets you practice them in one click.

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

## Prep & job fit

The **Prep** hub (`/prep`) is the ground-truth tier the practice modes draw on, as tabs:

- **Resume** — your resume text + target level; can bootstrap skeleton projects from it.
- **Projects** — the deep, level-aware ground truth, captured per **competency facet**
  (hardest-part-technically, ambiguity, influence, ownership, …). Each facet is built as a
  **conversational STAR interview** with the coach (not a textarea); in-progress drafts persist
  to both `localStorage` and Postgres (`facet_drafts`), so a half-built answer survives reloads
  and follows you across devices.
- **Stories** — answer-shaped STAR stories mined from projects; the coaching grader reads them.
- **Jobs** — paste a target job description; it's parsed once into structure (skills, seniority,
  ATS keywords) and stored.
- **Match** — score your resume against a stored job: a **fit score + structured gaps** (never a
  binary), each gap tagged *Reword* / *Add a story* / *Real gap*. Generating a JD-tailored resume
  from your projects/stories is **Phase 2** — see [`docs/PHASE2-resume-generation.md`](docs/PHASE2-resume-generation.md).
  The Match tab also hosts the **JD-driven interview loop** (below).

### JD-driven interview loop

A company rarely invents a bespoke question per candidate — it reaches for a **canonical** problem
whose complexity matches the business it runs, and probes the **values** it states. From a stored
job the Match tab predicts both rounds, ranked with a domain/value **rationale**:

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
`src/data/behavioralCriteria.ts`) and return only ids from the curated catalogs. Saved plans
persist on the job; each recommended item has a **Practice →** button that jumps straight to the
System Design or Behavioral tab with the problem/question loaded.

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

## Tech

Vite + React + **TypeScript** (strict), Tailwind CSS, Vitest. Backend: Node/Express +
Postgres + MinIO, a modular monolith where each feature is a router under `/api`
(`sessions`, `assets`, `llm`, `profile`, `projects`, `stories`, `facet-drafts`, `jobs`).
Shared domain types live in `src/types.ts`; system-design types sit next to their modules in
`src/{data,lib}/sysdesign`. Analyzers conform to one interface and the prompts/rubrics/selectors are
**data** (`src/data/criteria.ts`, `src/data/resumeCriteria.ts`, `src/data/sysdesign/genCriteria.ts`,
`src/data/behavioralCriteria.ts`), so swapping STAR for another framework, extending the problem
library, or adding a JD selector needs no UI/analyzer rework.

import pg from 'pg'

// Postgres access for the platform. One pool, shared by every feature module. The schema is
// intentionally generic: `sessions` holds any kind of activity/analysis as a jsonb payload
// (so new features need no schema change), and `assets` holds metadata for every binary
// (the bytes live in object storage — see storage.ts). User scoping (`user_id`) is a
// documented future column; today this is a single-user, local deployment.

const DATABASE_URL =
  process.env.DATABASE_URL || 'postgres://postgres:postgres@localhost:5432/delivery_coach'

export const pool = new pg.Pool({ connectionString: DATABASE_URL })

const SCHEMA = `
CREATE TABLE IF NOT EXISTS sessions (
  id           uuid PRIMARY KEY,
  kind         text NOT NULL,
  status       text NOT NULL,
  title        text,
  level        text,
  payload      jsonb NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS sessions_kind_idx ON sessions (kind);
CREATE INDEX IF NOT EXISTS sessions_updated_idx ON sessions (updated_at DESC);

CREATE TABLE IF NOT EXISTS assets (
  id            uuid PRIMARY KEY,
  session_id    uuid REFERENCES sessions(id) ON DELETE SET NULL,
  kind          text NOT NULL,
  object_key    text NOT NULL,
  content_type  text,
  size_bytes    bigint,
  original_name text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS assets_session_idx ON assets (session_id);

-- The candidate's profile: resume text + target level. Single row ('default') for now;
-- a user_id column is the documented future scoping point (see comment above), like sessions.
CREATE TABLE IF NOT EXISTS profile (
  id           text PRIMARY KEY DEFAULT 'default',
  resume_text  text,
  roles        jsonb NOT NULL DEFAULT '[]',
  target_level text NOT NULL DEFAULT 'senior',
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- The story bank: long-lived, editable ground-truth work stories. Unlike sessions (append-only
-- reps) these are curated, so they get their own table rather than a jsonb session payload.
CREATE TABLE IF NOT EXISTS stories (
  id                 uuid PRIMARY KEY,
  title              text NOT NULL,
  role_ref           text,
  star               jsonb NOT NULL DEFAULT '{}',
  impact             jsonb NOT NULL DEFAULT '{}',
  themes             text[] NOT NULL DEFAULT '{}',
  true_ceiling_level text,
  source_session_ids jsonb NOT NULL DEFAULT '[]',
  status             text NOT NULL DEFAULT 'draft',
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS stories_status_idx ON stories (status);

-- Projects: the rich, level-aware ground truth a story is mined from. One major effort, captured
-- across competency facets (jsonb). A story links back to its project via stories.project_id.
CREATE TABLE IF NOT EXISTS projects (
  id                      uuid PRIMARY KEY,
  title                   text NOT NULL,
  role_ref                text,
  summary                 text,
  facets                  jsonb NOT NULL DEFAULT '{}',
  target_level_at_capture text,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Additive link from a story to its source project (existing stories keep working with NULL).
ALTER TABLE stories ADD COLUMN IF NOT EXISTS project_id uuid;

-- In-progress, conversational STAR drafts for a project's facets. Mutable working state keyed by
-- (project, facet), so it gets a tiny upsert table like profile rather than a sessions payload. No
-- FK to projects(id): a draft can exist before its project's first save (the builder mints the id up
-- front), and the projects DELETE handler clears these explicitly.
CREATE TABLE IF NOT EXISTS facet_drafts (
  project_id uuid NOT NULL,
  facet_id   text NOT NULL,
  payload    jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (project_id, facet_id)
);

-- Target job descriptions to measure the resume against. Curated/editable like stories/projects, so
-- its own table; raw_text is the pasted JD and parsed holds the LLM-extracted structure (skills,
-- seniority, keywords) so a JD is parsed once and re-used for fit analysis.
CREATE TABLE IF NOT EXISTS job_descriptions (
  id         uuid PRIMARY KEY,
  title      text NOT NULL,
  company    text,
  raw_text   text,
  parsed     jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS jobs_updated_idx ON job_descriptions (updated_at DESC);
`

/** Create tables if they don't exist. No migration tool yet — additive DDL only. */
export async function initSchema(): Promise<void> {
  await pool.query(SCHEMA)
}

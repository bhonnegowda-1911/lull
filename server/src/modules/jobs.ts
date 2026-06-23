import { Router } from 'express'
import { pool } from '../db.js'

// Target job descriptions CRUD. A job is raw pasted text plus the LLM-extracted `parsed` structure
// (skills/seniority/keywords) the resume is measured against. Mirrors the SQL style of
// projects.ts/stories.ts; parsing and fit analysis are LLM calls that go through /api/llm/chat, so
// this router has no feature knowledge beyond the shape below.

export const jobs = Router()

const COLUMNS = 'id, title, company, raw_text, parsed, problem_picks, behavioral_picks, created_at, updated_at'

// GET /api/jobs → list, newest activity first.
jobs.get('/', async (_req, res) => {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM job_descriptions ORDER BY updated_at DESC`)
  res.json(rows)
})

// GET /api/jobs/:id → full row.
jobs.get('/:id', async (req, res) => {
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM job_descriptions WHERE id = $1`, [req.params.id])
  if (!rows.length) return res.status(404).json({ error: 'not found' })
  res.json(rows[0])
})

// PUT /api/jobs/:id → upsert. Body: { title, company, rawText, parsed, problemPicks, behavioralPicks }.
jobs.put('/:id', async (req, res) => {
  const { id } = req.params
  const { title = null, company = null, rawText = null, parsed = {}, problemPicks = [], behavioralPicks = [] } = req.body ?? {}
  if (!title) return res.status(400).json({ error: 'title is required' })
  const { rows } = await pool.query(
    `INSERT INTO job_descriptions (id, title, company, raw_text, parsed, problem_picks, behavioral_picks, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, now())
     ON CONFLICT (id) DO UPDATE SET
       title = EXCLUDED.title,
       company = EXCLUDED.company,
       raw_text = EXCLUDED.raw_text,
       parsed = EXCLUDED.parsed,
       problem_picks = EXCLUDED.problem_picks,
       behavioral_picks = EXCLUDED.behavioral_picks,
       updated_at = now()
     RETURNING ${COLUMNS}`,
    [id, title, company, rawText, JSON.stringify(parsed), JSON.stringify(problemPicks), JSON.stringify(behavioralPicks)],
  )
  res.json(rows[0])
})

// DELETE /api/jobs/:id
jobs.delete('/:id', async (req, res) => {
  await pool.query(`DELETE FROM job_descriptions WHERE id = $1`, [req.params.id])
  res.json({ ok: true })
})

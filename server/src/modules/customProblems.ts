import { Router } from 'express'
import { pool } from '../db.js'

// CRUD for user-generated, on-demand interview problems (coding + system design). The client authors
// these via the LLM and caches them in localStorage; this is the durable Postgres copy so they survive
// a cache clear and follow the user across devices. The whole problem (statement + grading hints) rides
// in `payload` as jsonb — the server has no knowledge of its shape, only the `kind` discriminator.

export const customProblems = Router()

// GET /api/custom-problems?kind=coding → list payloads, newest first.
customProblems.get('/', async (req, res) => {
  const { kind } = req.query
  const params: unknown[] = []
  let clause = ''
  if (typeof kind === 'string' && kind) {
    params.push(kind)
    clause = `WHERE kind = $1`
  }
  const { rows } = await pool.query(
    `SELECT payload FROM custom_problems ${clause} ORDER BY created_at DESC`,
    params,
  )
  res.json(rows.map((r) => r.payload))
})

// PUT /api/custom-problems/:id → upsert. Body: { kind, problem }.
customProblems.put('/:id', async (req, res) => {
  const { id } = req.params
  const { kind, problem } = req.body ?? {}
  if (!kind || !problem) return res.status(400).json({ error: 'kind and problem are required' })
  await pool.query(
    `INSERT INTO custom_problems (id, kind, payload, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET kind = EXCLUDED.kind, payload = EXCLUDED.payload, updated_at = now()`,
    [id, kind, JSON.stringify(problem)],
  )
  res.json({ ok: true })
})

// DELETE /api/custom-problems/:id
customProblems.delete('/:id', async (req, res) => {
  await pool.query(`DELETE FROM custom_problems WHERE id = $1`, [req.params.id])
  res.json({ ok: true })
})

import { Router } from 'express'
import { pool } from '../db.js'

// The single, cross-application prep plan — one merged day-by-day schedule built from every active
// interview. Single-user for now, so there is one row keyed 'default' (mirrors profile). GET returns
// { plan } (null until the client first generates one); PUT upserts the whole plan payload.

export const prepPlan = Router()

// GET /api/prep-plan → { plan: GlobalPrepPlan | null }
prepPlan.get('/', async (_req, res) => {
  const { rows } = await pool.query(`SELECT payload FROM prep_plan WHERE id = 'default'`)
  res.json({ plan: rows[0]?.payload ?? null })
})

// PUT /api/prep-plan → upsert the plan payload, returns { plan }.
prepPlan.put('/', async (req, res) => {
  const plan = req.body ?? null
  const { rows } = await pool.query(
    `INSERT INTO prep_plan (id, payload, updated_at)
     VALUES ('default', $1, now())
     ON CONFLICT (id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
     RETURNING payload`,
    [plan === null ? null : JSON.stringify(plan)],
  )
  res.json({ plan: rows[0]?.payload ?? null })
})

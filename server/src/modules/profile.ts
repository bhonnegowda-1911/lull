import { Router } from 'express'
import { pool } from '../db.js'

// The candidate's profile — resume text + target level. Single-user for now, so there is one
// row keyed 'default'. Interview mode reads the resume + target level; coaching mode adds the
// story bank on top. GET lazily creates the default row so the client never 404s on first load.

export const profile = Router()

const COLUMNS = 'id, resume_text, roles, target_level, updated_at'

// GET /api/profile → the single profile row (created on first access).
profile.get('/', async (_req, res) => {
  await pool.query(`INSERT INTO profile (id) VALUES ('default') ON CONFLICT (id) DO NOTHING`)
  const { rows } = await pool.query(`SELECT ${COLUMNS} FROM profile WHERE id = 'default'`)
  res.json(rows[0])
})

// PUT /api/profile → upsert resume_text / roles / target_level.
profile.put('/', async (req, res) => {
  const { resumeText = null, roles = [], targetLevel = 'senior' } = req.body ?? {}
  const { rows } = await pool.query(
    `INSERT INTO profile (id, resume_text, roles, target_level, updated_at)
     VALUES ('default', $1, $2, $3, now())
     ON CONFLICT (id) DO UPDATE SET
       resume_text = EXCLUDED.resume_text,
       roles = EXCLUDED.roles,
       target_level = EXCLUDED.target_level,
       updated_at = now()
     RETURNING ${COLUMNS}`,
    [resumeText, JSON.stringify(roles), targetLevel],
  )
  res.json(rows[0])
})

import { Router } from 'express'
import { pool } from '../db.js'

// Durable store for in-progress, conversational STAR facet drafts. Keyed by (project_id, facet_id),
// upserted on every coaching turn so a half-built answer survives across devices, not just reloads.
// The browser keeps a localStorage cache on top of this (graceful offline fallback); the accepted
// answer ultimately lands in projects.facets and the draft here is deleted.

export const facetDrafts = Router()

// GET /api/facet-drafts/:projectId → [{ facet_id, payload, updated_at }] for the project.
facetDrafts.get('/:projectId', async (req, res) => {
  const { rows } = await pool.query(
    `SELECT facet_id, payload, updated_at FROM facet_drafts WHERE project_id = $1`,
    [req.params.projectId],
  )
  res.json(rows)
})

// PUT /api/facet-drafts/:projectId/:facetId → upsert the draft payload ({ messages, beats, draft }).
facetDrafts.put('/:projectId/:facetId', async (req, res) => {
  const { projectId, facetId } = req.params
  const { rows } = await pool.query(
    `INSERT INTO facet_drafts (project_id, facet_id, payload, updated_at)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (project_id, facet_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()
     RETURNING facet_id, payload, updated_at`,
    [projectId, facetId, JSON.stringify(req.body ?? {})],
  )
  res.json(rows[0])
})

// DELETE /api/facet-drafts/:projectId/:facetId → drop one draft (accepted or discarded).
facetDrafts.delete('/:projectId/:facetId', async (req, res) => {
  await pool.query(`DELETE FROM facet_drafts WHERE project_id = $1 AND facet_id = $2`, [
    req.params.projectId,
    req.params.facetId,
  ])
  res.json({ ok: true })
})

// DELETE /api/facet-drafts/:projectId → drop every draft for a project (also called on project delete).
facetDrafts.delete('/:projectId', async (req, res) => {
  await pool.query(`DELETE FROM facet_drafts WHERE project_id = $1`, [req.params.projectId])
  res.json({ ok: true })
})

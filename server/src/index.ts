import 'dotenv/config'
import express from 'express'
import cors from 'cors'
import { initSchema } from './db.js'
import { ensureBucket } from './storage.js'
import { sessions } from './modules/sessions.js'
import { assets } from './modules/assets.js'
import { llm, providerStatus } from './modules/llm.js'
import { profile } from './modules/profile.js'
import { stories } from './modules/stories.js'
import { projects } from './modules/projects.js'
import { facetDrafts } from './modules/facetDrafts.js'
import { jobs } from './modules/jobs.js'
import { customProblems } from './modules/customProblems.js'
import { prepPlan } from './modules/prepPlan.js'

// Modular-monolith API: one service, one shared db pool + object store, feature routers
// mounted under /api. New feature modules (resume, jobs, tutor) slot in the same way.

const app = express()
app.use(cors())
app.use(express.json({ limit: '4mb' }))

app.get('/api/health', (_req, res) => res.json({ ok: true }))
app.get('/api/config', (_req, res) => res.json({ providers: providerStatus() }))

app.use('/api/sessions', sessions)
app.use('/api/assets', assets)
app.use('/api/llm', llm)
app.use('/api/profile', profile)
app.use('/api/stories', stories)
app.use('/api/projects', projects)
app.use('/api/facet-drafts', facetDrafts)
app.use('/api/jobs', jobs)
app.use('/api/custom-problems', customProblems)
app.use('/api/prep-plan', prepPlan)

// Surface async handler errors as JSON rather than crashing the process.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[api] unhandled error', err)
  res.status(500).json({ error: (err as Error)?.message || 'Internal server error' })
})

const PORT = Number(process.env.PORT) || 8787

async function start() {
  await initSchema()
  await ensureBucket()
  app.listen(PORT, () => console.log(`[api] listening on http://localhost:${PORT}`))
}

start().catch((e) => {
  console.error('[api] failed to start', e)
  process.exit(1)
})

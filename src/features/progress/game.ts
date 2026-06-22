// Gamification, derived purely from the per-session performance scores in trends.ts — no
// stored XP, nothing to migrate. Two notions, by design (the user picked "both"):
//   • XP / level — cumulative, only ever goes up; rewards showing up and putting in reps.
//   • Rank — a tier (Bronze→Diamond) from RECENT performance; rises and falls with skill.
// All functions are pure so they're unit-tested without a backend.

import { mean, type Direction, type Point } from './trends'

export const RANK_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Diamond'] as const
// Divisions count DOWN within a tier (III is the entry, I is the top), as in most ranked games.
export const RANK_DIVISIONS = ['III', 'II', 'I'] as const
const RANK_COUNT = RANK_TIERS.length * RANK_DIVISIONS.length // 15 rungs over 0–100

export interface Rank {
  index: number // 0..14, for comparing direction
  tier: (typeof RANK_TIERS)[number]
  division: (typeof RANK_DIVISIONS)[number]
  label: string
}

/** Map a 0–100 score onto the 15-rung ladder. */
export function rankFromScore(score: number): Rank {
  const idx = Math.max(0, Math.min(RANK_COUNT - 1, Math.floor((score / 100) * RANK_COUNT)))
  const tier = RANK_TIERS[Math.floor(idx / RANK_DIVISIONS.length)]
  const division = RANK_DIVISIONS[idx % RANK_DIVISIONS.length]
  return { index: idx, tier, division, label: `${tier} ${division}` }
}

/** XP for one session: a completion floor (20) plus a skill bonus, so XP only ever grows. */
export function xpForScore(score: number): number {
  return Math.round(20 + Math.max(0, Math.min(100, score)) * 0.8) // 20..100
}

export interface LevelInfo {
  level: number
  into: number // XP earned into the current level
  need: number // XP the current level spans
  toNext: number
  progress: number // 0..1
}

/**
 * Level from cumulative XP on a gently rising curve: level 1→2 costs 200 XP, each level +100.
 */
export function levelFromXp(totalXp: number): LevelInfo {
  let level = 1
  let need = 200
  let acc = 0
  while (totalXp >= acc + need) {
    acc += need
    level += 1
    need += 100
  }
  const into = totalXp - acc
  return { level, into, need, toNext: need - into, progress: need ? into / need : 0 }
}

export interface GameStat extends LevelInfo {
  totalXp: number
  lastXp: number
  rank: Rank
  rankDir: Direction
}

/** Sessions in the rolling window that defines current rank. */
const WINDOW = 3

/** Roll up a mode's score series into XP/level + current rank with direction. Null if empty. */
export function summarizeGame(scores: Point[]): GameStat | null {
  if (scores.length === 0) return null
  const totalXp = scores.reduce((sum, p) => sum + xpForScore(p.value), 0)
  const lastXp = xpForScore(scores[scores.length - 1].value)
  const level = levelFromXp(totalXp)

  const rank = rankFromScore(mean(scores.slice(-WINDOW).map((p) => p.value)) ?? 0)
  // Direction: this window's rank vs the immediately preceding window.
  const priorMean = mean(scores.slice(-(WINDOW * 2), -WINDOW).map((p) => p.value))
  let rankDir: Direction = 'flat'
  if (priorMean != null) {
    const prev = rankFromScore(priorMean)
    rankDir = rank.index > prev.index ? 'up' : rank.index < prev.index ? 'down' : 'flat'
  }

  return { ...level, totalXp, lastXp, rank, rankDir }
}

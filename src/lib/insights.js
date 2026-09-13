import { LEVELS } from './levels'

const MAX_LEVEL = 4

function mean(values) {
  if (!values.length) return null
  return values.reduce((sum, v) => sum + v, 0) / values.length
}

function round1(value) {
  return value === null ? null : Math.round(value * 10) / 10
}

function pct(avgLevel) {
  return avgLevel === null ? null : Math.round((avgLevel / MAX_LEVEL) * 100)
}

/**
 * Turns the raw matrix tables into everything the dashboard shows.
 *
 * Two conventions run through all of it:
 *  - A cell counts as "rated" only when current_level is set. Cells nobody has
 *    touched are Not Required, not zero — averaging them in as zeros would drag
 *    every number down and make an unfilled matrix look like an unskilled team.
 *  - Percentages are the average level over 4, so "Capable" everywhere reads 75%.
 */
export function computeInsights({ departments, skills, members, ratings }) {
  const totalCells = members.length * skills.length
  const skillById = new Map(skills.map((s) => [s.id, s]))
  const memberById = new Map(members.map((m) => [m.id, m]))

  // Ignore rows pointing at deleted members/skills, which can linger briefly
  // between a delete and a refetch.
  const live = ratings.filter((r) => skillById.has(r.skill_id) && memberById.has(r.member_id))

  const rated = live.filter((r) => r.current_level != null)
  const targeted = live.filter((r) => r.target_level != null)
  const bothSet = live.filter((r) => r.current_level != null && r.target_level != null)

  const avgCurrent = mean(rated.map((r) => r.current_level))
  const avgTarget = mean(targeted.map((r) => r.target_level))
  const avgGap = mean(bothSet.map((r) => Math.max(0, r.target_level - r.current_level)))

  // ---- distribution across the 5 levels -------------------------------------
  const counts = new Map(LEVELS.map((l) => [l.value, 0]))
  for (const r of rated) {
    counts.set(r.current_level, (counts.get(r.current_level) ?? 0) + 1)
  }
  counts.set(null, Math.max(0, totalCells - rated.length))

  const distribution = LEVELS.map((l) => ({
    value: l.value,
    label: l.label,
    short: l.short,
    count: counts.get(l.value) ?? 0,
  }))

  // ---- per department --------------------------------------------------------
  const departmentCoverage = departments
    .map((dept) => {
      const deptSkillIds = new Set(
        skills.filter((s) => s.department_id === dept.id).map((s) => s.id),
      )
      const deptRated = rated.filter((r) => deptSkillIds.has(r.skill_id))
      const deptTargeted = targeted.filter((r) => deptSkillIds.has(r.skill_id))
      return {
        id: dept.id,
        name: dept.name,
        skillCount: deptSkillIds.size,
        current: round1(mean(deptRated.map((r) => r.current_level))),
        target: round1(mean(deptTargeted.map((r) => r.target_level))),
        ratedCount: deptRated.length,
      }
    })
    .filter((d) => d.skillCount > 0)
    .sort((a, b) => (b.current ?? -1) - (a.current ?? -1))

  // ---- per person ------------------------------------------------------------
  const perMember = members.map((m) => {
    const theirs = rated.filter((r) => r.member_id === m.id)
    return {
      id: m.id,
      name: m.name,
      role: m.role,
      ratedCount: theirs.length,
      current: mean(theirs.map((r) => r.current_level)),
    }
  })

  const assessed = perMember.filter((m) => m.ratedCount > 0)
  const unassessedCount = perMember.length - assessed.length
  const byStrength = [...assessed].sort((a, b) => b.current - a.current)

  // Take from each end without the two lists ever overlapping — otherwise a
  // small team shows the same person as both its top performer and its biggest
  // growth opportunity, which is true but useless.
  const endSize = assessed.length < 2 ? 0 : Math.min(5, Math.floor(assessed.length / 2))
  const leadingMembers = byStrength.slice(0, endSize || assessed.length).map((m) => ({
    ...m,
    pct: pct(m.current),
  }))
  const growthMembers = (endSize ? byStrength.slice(-endSize).reverse() : []).map((m) => ({
    ...m,
    pct: pct(m.current),
  }))

  // ---- per skill -------------------------------------------------------------
  const perSkill = skills.map((s) => {
    const theirs = rated.filter((r) => r.skill_id === s.id)
    const gaps = bothSet.filter((r) => r.skill_id === s.id)
    return {
      id: s.id,
      name: s.name,
      departmentName: departments.find((d) => d.id === s.department_id)?.name ?? '—',
      ratedCount: theirs.length,
      current: mean(theirs.map((r) => r.current_level)),
      gap: mean(gaps.map((r) => Math.max(0, r.target_level - r.current_level))),
    }
  })

  const strongestSkills = perSkill
    .filter((s) => s.ratedCount > 0)
    .sort((a, b) => b.current - a.current)
    .slice(0, 5)
    .map((s) => ({ ...s, current: round1(s.current) }))

  const biggestGaps = perSkill
    .filter((s) => s.gap != null && s.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 5)
    .map((s) => ({ ...s, gap: round1(s.gap) }))

  return {
    isEmpty: totalCells === 0 || rated.length === 0,
    totalCells,
    memberCount: members.length,
    skillCount: skills.length,
    ratedCount: rated.length,
    coveragePct: totalCells ? Math.round((rated.length / totalCells) * 100) : 0,
    currentPct: pct(avgCurrent),
    targetPct: pct(avgTarget),
    avgCurrent: round1(avgCurrent),
    avgTarget: round1(avgTarget),
    avgGap: round1(avgGap),
    distribution,
    departmentCoverage,
    leadingMembers,
    growthMembers,
    unassessedCount,
    strongestSkills,
    biggestGaps,
  }
}

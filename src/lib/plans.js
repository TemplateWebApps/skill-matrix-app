/**
 * What each plan allows.
 *
 * Two counted limits — people and skills — and one feature, the dashboard.
 *
 * The two counts are a copy of the numbers in the plan_limit() function in the
 * database. The database is the real gate there — it has to be, because the
 * browser can talk to it directly — and this copy exists only so the app can
 * warn someone before they hit a wall rather than after. Change one, change
 * both.
 *
 * The dashboard flag is different, and it's worth being clear about: it is
 * enforced HERE AND NOWHERE ELSE. The dashboard is calculated in the page out
 * of matrix rows the workspace already has every right to read, so there is no
 * server request to refuse. It stops an honest user, not a determined one.
 * Making it a real gate means computing insights server-side.
 */

export const PLANS = {
  free: {
    key: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    members: 25,
    skills: 25,
    dashboard: false,
  },
  unlimited: {
    key: 'unlimited',
    name: 'Unlimited',
    price: '$9.99',
    cadence: 'per month',
    members: null,
    skills: null,
    dashboard: true,
  },
}

export const PLAN_ORDER = ['free', 'unlimited']

// Until checkout exists, upgrading means someone changing the plan by hand.
// Replace this with a real checkout link when billing is wired up.
export const UPGRADE_EMAIL = 'templatewebapps@gmail.com'

// A workspace loaded by an older copy of the app — or before a migration has
// run — has no plan on it at all. Guessing "free" there would lock people out
// of their own data over a field that simply wasn't sent, so an unknown plan
// gets everything and the database stays the judge.
const UNKNOWN = { key: 'unknown', name: 'Unknown', members: null, skills: null, dashboard: true }

export function planOf(workspace) {
  const key = workspace?.plan
  // 'plus' was the middle tier before pricing was simplified to two. Any row
  // still carrying it keeps everything it had rather than being read as a
  // plan the app doesn't recognise.
  if (key === 'plus') return PLANS.unlimited
  return PLANS[key] ?? UNKNOWN
}

export function limitOf(plan, kind) {
  return plan?.[kind] ?? null
}

export function isAtLimit(plan, kind, count) {
  const limit = limitOf(plan, kind)
  return limit !== null && count >= limit
}

export function remaining(plan, kind, count) {
  const limit = limitOf(plan, kind)
  return limit === null ? null : Math.max(0, limit - count)
}

export function canUseDashboard(plan) {
  return plan?.dashboard !== false
}

/** The cheapest plan that lifts the limit you just hit. */
export function upgradeFor(plan, kind) {
  const from = PLAN_ORDER.indexOf(plan?.key)
  if (from === -1) return null
  for (const key of PLAN_ORDER.slice(from + 1)) {
    const candidate = PLANS[key]
    const limit = limitOf(candidate, kind)
    if (limit === null || limit > limitOf(plan, kind)) return candidate
  }
  return null
}

export const LIMIT_LABEL = {
  members: { one: 'person', many: 'people', thing: 'team member' },
  skills: { one: 'skill', many: 'skills', thing: 'skill' },
}

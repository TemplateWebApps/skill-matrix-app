/**
 * What each plan allows.
 *
 * One limit, one number: how many people you can put in the matrix. Everything
 * else — categories, skills, invites, the dashboard — is the same on both
 * plans, because a pricing page people have to study is a pricing page people
 * leave.
 *
 * These numbers are a copy of the ones in the plan_limit() function in the
 * database. The database is the real gate — it has to be, because the browser
 * can talk to it directly — and this copy exists only so the app can warn
 * someone before they hit a wall rather than after. Change one, change both.
 */

export const PLANS = {
  free: {
    key: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    members: 25,
  },
  unlimited: {
    key: 'unlimited',
    name: 'Unlimited',
    price: '$9.99',
    cadence: 'per month',
    members: null,
  },
}

export const PLAN_ORDER = ['free', 'unlimited']

// Until checkout exists, upgrading means someone changing the plan by hand.
// Replace this with a real checkout link when billing is wired up.
export const UPGRADE_EMAIL = 'templatewebapps@gmail.com'

// A workspace loaded by an older copy of the app — or before a migration has
// run — has no plan on it at all. Guessing "free" there would lock people out
// of their own data over a field that simply wasn't sent, so an unknown plan
// is treated as unlimited and the database stays the judge.
const UNKNOWN = { key: 'unknown', name: 'Unknown', members: null }

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
}

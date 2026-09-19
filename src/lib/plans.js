/**
 * What each plan allows.
 *
 * These numbers are a copy of the ones in 008_plan_gating.sql. The database is
 * the real gate — it has to be, because the browser can talk to it directly —
 * and this copy exists only so the app can warn someone before they run into a
 * wall rather than after. If you change a limit, change it in both places.
 */

export const PLANS = {
  free: {
    key: 'free',
    name: 'Free',
    price: '$0',
    cadence: 'forever',
    members: 25,
    categories: 1,
  },
  plus: {
    key: 'plus',
    name: 'Plus',
    price: '$5.99',
    cadence: 'per person / month',
    members: 100,
    categories: null,
  },
  unlimited: {
    key: 'unlimited',
    name: 'Unlimited',
    price: '$9.99',
    cadence: 'per person / month',
    members: null,
    categories: null,
  },
}

export const PLAN_ORDER = ['free', 'plus', 'unlimited']

// Until checkout exists, upgrading means someone changing the plan by hand.
// Replace this with a real checkout link when billing is wired up.
export const UPGRADE_EMAIL = 'templatewebapps@gmail.com'

// A workspace loaded by an older copy of the app — or before the migration has
// run — has no plan on it at all. Guessing "free" there would lock people out
// of their own data over a field that simply wasn't sent, so an unknown plan
// is treated as unlimited and the database stays the judge.
const UNKNOWN = { key: 'unknown', name: 'Unknown', members: null, categories: null }

export function planOf(workspace) {
  return PLANS[workspace?.plan] ?? UNKNOWN
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

/**
 * The cheapest plan that would actually solve the limit you just hit — not
 * simply the next one up the list. Someone stuck on Free's single category
 * needs Plus; someone stuck on Plus's 100 people needs Unlimited.
 */
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
  categories: { one: 'category', many: 'categories', thing: 'category' },
}

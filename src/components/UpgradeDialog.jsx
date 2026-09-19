import { LIMIT_LABEL, UPGRADE_EMAIL, limitOf, upgradeFor } from '../lib/plans'
import './upgrade.css'

/**
 * Shown when someone tries to add a person or a category their plan doesn't
 * cover. It replaces what would otherwise be a database error message, so it
 * has to answer three things: what stopped, why, and what to do about it.
 */
export default function UpgradeDialog({ plan, kind, count, onClose }) {
  const label = LIMIT_LABEL[kind]
  const limit = limitOf(plan, kind)
  const next = upgradeFor(plan, kind)
  const nextLimit = next ? limitOf(next, kind) : null
  // The same dialog is opened deliberately from the Team page to look at the
  // options, so it can't assume the limit has actually been reached.
  const reached = limit !== null && count >= limit
  const noun = limit === 1 ? label.one : label.many

  const subject = encodeURIComponent(`Upgrade to ${next?.name ?? 'a larger plan'}`)
  const body = encodeURIComponent(
    `I'd like to upgrade my Skill Matrix workspace to ${next?.name ?? 'a larger plan'}.`,
  )

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card upgrade-card" onClick={(e) => e.stopPropagation()}>
        <span className="upgrade-plan">{plan.name} plan</span>
        <h2>
          {reached
            ? `You've used all ${limit} ${noun}`
            : `${plan.name} covers ${limit} ${noun}`}
        </h2>
        <p className="upgrade-body">
          {reached ? (
            <>
              The {plan.name} plan covers {limit} {noun}, and this workspace has {count}. Nothing
              has been lost — everything already here stays exactly as it is, you just can&rsquo;t
              add another {label.thing} until you move up.
            </>
          ) : (
            <>
              This workspace is using {count} of them. You can keep adding until you reach{' '}
              {limit}.
            </>
          )}
        </p>

        {next && (
          <div className="upgrade-next">
            <div className="upgrade-next-head">
              <strong>{next.name}</strong>
              <span>
                {next.price} <em>{next.cadence}</em>
              </span>
            </div>
            <p>
              {nextLimit === null
                ? `Unlimited ${label.many}`
                : `Up to ${nextLimit} ${label.many}`}
              {next.key === 'plus' && kind === 'categories' ? ', and up to 100 people' : ''}
            </p>
          </div>
        )}

        <p className="upgrade-note">
          Checkout isn&rsquo;t switched on yet. Email us and we&rsquo;ll move your workspace over
          by hand.
        </p>

        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Not now
          </button>
          <a className="upgrade-cta" href={`mailto:${UPGRADE_EMAIL}?subject=${subject}&body=${body}`}>
            Request an upgrade
          </a>
        </div>
      </div>
    </div>
  )
}

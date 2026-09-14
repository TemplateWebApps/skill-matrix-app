import { memo } from 'react'
import { LEVELS, levelClass } from '../../lib/levels'

/**
 * Deliberately stateless.
 *
 * Each cell used to own a useState for its popover plus a useEffect that
 * registered a document listener. With a full matrix that's hundreds of hooks
 * and listeners created and torn down every time the grid mounts or filters,
 * which is what made those operations slow. Which cell is open now lives once
 * in the grid, and every prop here is a primitive so memo actually holds.
 */
function RatingCell({ memberId, skillId, field, value, label, isOpen, onToggle, onPick }) {
  const current = LEVELS.find((l) => l.value === value) ?? LEVELS[0]

  return (
    <div className="rating-cell">
      <button
        type="button"
        className={`rating-badge ${levelClass(value)}`}
        onClick={() => onToggle(memberId, skillId, field)}
        title={`${label}: ${current.label}`}
      >
        {current.short}
      </button>
      {isOpen && (
        <div className="rating-popover">
          {LEVELS.map((l) => (
            <button
              key={l.value ?? 'none'}
              type="button"
              className={`rating-badge rating-badge-sm ${levelClass(l.value)}`}
              title={l.label}
              onClick={() => onPick(memberId, skillId, field, l.value)}
            >
              {l.short}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default memo(RatingCell)

import { useState, useRef, useEffect } from 'react'
import { LEVELS, levelClass } from '../../lib/levels'

export default function RatingCell({ value, onChange, label }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [open])

  const current = LEVELS.find((l) => l.value === value) ?? LEVELS[0]

  return (
    <div className="rating-cell" ref={ref}>
      <button
        type="button"
        className={`rating-badge ${levelClass(value)}`}
        onClick={() => setOpen((o) => !o)}
        title={`${label}: ${current.label}`}
      >
        {current.short}
      </button>
      {open && (
        <div className="rating-popover">
          {LEVELS.map((l) => (
            <button
              key={l.value ?? 'none'}
              type="button"
              className={`rating-badge rating-badge-sm ${levelClass(l.value)}`}
              title={l.label}
              onClick={() => {
                onChange(l.value)
                setOpen(false)
              }}
            >
              {l.short}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

import { useState } from 'react'

export default function AddCategoryForm({ error, saving, onSubmit, onClose }) {
  const [name, setName] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit(name.trim())
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Add a category</h2>
        <p className="panel-hint">
          Categories group skills together — the coloured bars across the top of the matrix.
        </p>
        {error && <p className="auth-error">{error}</p>}
        <label>
          Category name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={80}
            placeholder="e.g. Quality &amp; Compliance"
            autoFocus
            required
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Adding…' : 'Add category'}
          </button>
        </div>
      </form>
    </div>
  )
}

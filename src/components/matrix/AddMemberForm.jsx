import { useState } from 'react'

export default function AddMemberForm({ error, saving, onSubmit, onClose }) {
  const [name, setName] = useState('')
  const [role, setRole] = useState('')

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    onSubmit({ name: name.trim(), role: role.trim() })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Add a team member</h2>
        {error && <p className="auth-error">{error}</p>}
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} autoFocus required />
        </label>
        <label>
          Role <span className="label-optional">optional</span>
          <input
            value={role}
            onChange={(e) => setRole(e.target.value)}
            maxLength={80}
            placeholder="e.g. Process Analyst"
          />
        </label>
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Adding…' : 'Add member'}
          </button>
        </div>
      </form>
    </div>
  )
}

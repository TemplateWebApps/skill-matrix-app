import { useState } from 'react'

export default function AddSkillForm({ departments, defaultDepartmentId, error, saving, onSubmit, onClose }) {
  const [name, setName] = useState('')
  // A brand-new workspace has no departments yet, so start on "new department"
  // rather than an empty value the <select> can't match — otherwise the
  // dropdown reads "+ New department…" while the name field stays hidden, and
  // saving sends an empty department id.
  const [departmentId, setDepartmentId] = useState(
    defaultDepartmentId ?? departments[0]?.id ?? '__new__',
  )
  const [newDepartment, setNewDepartment] = useState('')
  const isNewDepartment = departmentId === '__new__' || departments.length === 0

  function handleSubmit(e) {
    e.preventDefault()
    if (!name.trim()) return
    if (isNewDepartment && !newDepartment.trim()) return
    onSubmit({
      name: name.trim(),
      departmentId: isNewDepartment ? null : departmentId,
      newDepartmentName: isNewDepartment ? newDepartment.trim() : null,
    })
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <form className="modal-card" onClick={(e) => e.stopPropagation()} onSubmit={handleSubmit}>
        <h2>Add a skill</h2>
        {error && <p className="auth-error">{error}</p>}
        <label>
          Skill name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>
        <label>
          Category
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
            <option value="__new__">+ New category…</option>
          </select>
        </label>
        {isNewDepartment && (
          <label>
            New category name
            <input
              value={newDepartment}
              onChange={(e) => setNewDepartment(e.target.value)}
              maxLength={80}
              required
            />
          </label>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={saving || !name.trim()}>
            {saving ? 'Adding…' : 'Add skill'}
          </button>
        </div>
      </form>
    </div>
  )
}

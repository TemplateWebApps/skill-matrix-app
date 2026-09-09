import { useState } from 'react'

export default function AddSkillForm({ departments, onSubmit, onClose }) {
  const [name, setName] = useState('')
  const [departmentId, setDepartmentId] = useState(departments[0]?.id ?? '')
  const [newDepartment, setNewDepartment] = useState('')
  const isNewDepartment = departmentId === '__new__'

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
        <label>
          Skill name
          <input value={name} onChange={(e) => setName(e.target.value)} autoFocus required />
        </label>
        <label>
          Department
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
            <option value="__new__">+ New department…</option>
          </select>
        </label>
        {isNewDepartment && (
          <label>
            New department name
            <input value={newDepartment} onChange={(e) => setNewDepartment(e.target.value)} required />
          </label>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit">Add skill</button>
        </div>
      </form>
    </div>
  )
}

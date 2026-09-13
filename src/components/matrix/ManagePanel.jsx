import { useState } from 'react'

const MAX_NAME = 80

/**
 * Renaming and deleting departments and their skills.
 *
 * Names commit on blur (or Enter). Clearing one to nothing reverts it rather
 * than saving a blank — an unnamed column is impossible to identify later.
 */
export default function ManagePanel({ departments, skills, error, onRenameDepartment, onDeleteDepartment, onRenameSkill, onDeleteSkill, onClose }) {
  const [drafts, setDrafts] = useState({})

  const valueFor = (id, saved) => (drafts[id] !== undefined ? drafts[id] : saved)
  const setDraft = (id, value) => setDrafts((d) => ({ ...d, [id]: value }))
  const clearDraft = (id) => setDrafts((d) => {
    const next = { ...d }
    delete next[id]
    return next
  })

  // Takes the value straight off the input rather than out of draft state:
  // a blur landing in the same frame as the last keystroke would otherwise
  // read a stale closure and silently drop the edit.
  function commit(id, saved, rename, currentValue) {
    const trimmed = (currentValue ?? '').trim()
    if (!trimmed || trimmed === saved) {
      clearDraft(id) // put back whatever is stored
      return
    }
    rename(id, trimmed)
    clearDraft(id)
  }

  const skillsByDepartment = (departmentId) =>
    skills.filter((s) => s.department_id === departmentId)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card manage-card" onClick={(e) => e.stopPropagation()}>
        <h2>Manage skills</h2>
        <p className="panel-hint">
          Rename anything by typing over it. Deleting a department also deletes the skills inside
          it, along with every rating on those skills.
        </p>
        {error && <p className="auth-error">{error}</p>}

        {departments.length === 0 && (
          <p className="panel-hint">No departments yet — add a skill and you can create one.</p>
        )}

        <div className="manage-list">
          {departments.map((dept) => {
            const deptSkills = skillsByDepartment(dept.id)
            return (
              <section key={dept.id} className="manage-dept">
                <div className="manage-row manage-row-dept">
                  <input
                    value={valueFor(dept.id, dept.name)}
                    maxLength={MAX_NAME}
                    aria-label={`Department name: ${dept.name}`}
                    onChange={(e) => setDraft(dept.id, e.target.value)}
                    onBlur={(e) => commit(dept.id, dept.name, onRenameDepartment, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') e.currentTarget.blur()
                      if (e.key === 'Escape') clearDraft(dept.id)
                    }}
                  />
                  <span className="manage-count">
                    {deptSkills.length} {deptSkills.length === 1 ? 'skill' : 'skills'}
                  </span>
                  <button
                    type="button"
                    className="manage-delete"
                    onClick={() => onDeleteDepartment(dept, deptSkills.length)}
                  >
                    Delete
                  </button>
                </div>

                {deptSkills.length > 0 && (
                  <ul className="manage-skills">
                    {deptSkills.map((skill) => (
                      <li key={skill.id} className="manage-row">
                        <input
                          value={valueFor(skill.id, skill.name)}
                          maxLength={MAX_NAME}
                          aria-label={`Skill name: ${skill.name}`}
                          onChange={(e) => setDraft(skill.id, e.target.value)}
                          onBlur={(e) => commit(skill.id, skill.name, onRenameSkill, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                            if (e.key === 'Escape') clearDraft(skill.id)
                          }}
                        />
                        <button
                          type="button"
                          className="manage-delete"
                          onClick={() => onDeleteSkill(skill)}
                        >
                          Delete
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            )
          })}
        </div>

        <div className="modal-actions">
          <button type="button" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}

import { LEVELS } from '../../lib/levels'

export default function MatrixToolbar({
  search,
  onSearchChange,
  departments,
  departmentFilter,
  onDepartmentFilterChange,
  onAddMember,
  onAddSkill,
}) {
  return (
    <div className="matrix-toolbar">
      <div className="toolbar-row">
        <input
          className="toolbar-search"
          placeholder="Search member or role…"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        <select value={departmentFilter} onChange={(e) => onDepartmentFilterChange(e.target.value)}>
          <option value="all">All departments</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name}
            </option>
          ))}
        </select>
        <button type="button" onClick={onAddMember}>
          + Member
        </button>
        <button type="button" onClick={onAddSkill}>
          + Skill
        </button>
      </div>
      <div className="toolbar-row legend">
        {LEVELS.map((l) => (
          <span key={l.value ?? 'none'} className="legend-item">
            <span className={`rating-badge rating-badge-sm lvl-${l.value ?? 'none'}`}>{l.short}</span>
            {l.label}
          </span>
        ))}
      </div>
      {departmentFilter !== 'all' && (
        <p className="toolbar-note">Column drag-to-reorder is only available when viewing all departments.</p>
      )}
    </div>
  )
}

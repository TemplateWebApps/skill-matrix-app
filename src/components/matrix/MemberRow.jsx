import { Fragment, memo } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import RatingCell from './RatingCell'

function MemberRow({
  member,
  skills,
  emptyDepartments = [],
  ratingsMap,
  rowOpenKey,
  onToggleCell,
  onPickLevel,
  onRename,
  onRenameCommit,
  onRemove,
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: member.id,
    data: { type: 'member' },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <tr ref={setNodeRef} style={style}>
      <td className="member-cell">
        <button type="button" className="drag-handle" title="Drag to reorder" {...attributes} {...listeners}>
          ⠿
        </button>
        <div className="member-fields">
          <input
            className="member-name"
            value={member.name}
            maxLength={80}
            aria-label="Member name"
            onChange={(e) => onRename(member.id, { name: e.target.value })}
            onBlur={(e) => onRenameCommit(member.id, { name: e.target.value })}
          />
          <input
            className="member-role"
            value={member.role ?? ''}
            placeholder="Role"
            maxLength={80}
            aria-label="Member role"
            onChange={(e) => onRename(member.id, { role: e.target.value })}
            onBlur={(e) => onRenameCommit(member.id, { role: e.target.value })}
          />
        </div>
        <button
          type="button"
          className="member-remove"
          title="Remove"
          onClick={() => onRemove(member.id, member.name)}
        >
          ×
        </button>
      </td>
      {skills.map((skill) => {
        const rating = ratingsMap.get(`${member.id}:${skill.id}`)
        const curKey = `${member.id}:${skill.id}:current_level`
        const tarKey = `${member.id}:${skill.id}:target_level`
        return (
          <Fragment key={skill.id}>
            <td className="cell-cur">
              <RatingCell
                memberId={member.id}
                skillId={skill.id}
                field="current_level"
                label="Current"
                value={rating?.current_level ?? null}
                isOpen={rowOpenKey === curKey}
                onToggle={onToggleCell}
                onPick={onPickLevel}
              />
            </td>
            <td className="cell-tar">
              <RatingCell
                memberId={member.id}
                skillId={skill.id}
                field="target_level"
                label="Target"
                value={rating?.target_level ?? null}
                isOpen={rowOpenKey === tarKey}
                onToggle={onToggleCell}
                onPick={onPickLevel}
              />
            </td>
          </Fragment>
        )
      })}
      {/* Keep the body aligned with the header's empty-category and
          add-category columns. */}
      {emptyDepartments.map((dept) => (
        <td key={dept.id} className="empty-dept-cell" />
      ))}
      <td className="add-category-cell" />
    </tr>
  )
}

export default memo(MemberRow)

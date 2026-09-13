import { Fragment } from 'react'
import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import RatingCell from './RatingCell'

export default function MemberRow({ member, skills, ratingsMap, onRename, onRenameCommit, onRemove, onSetLevel }) {
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
        <button type="button" className="member-remove" title="Remove" onClick={() => onRemove(member.id)}>
          ×
        </button>
      </td>
      {skills.map((skill) => {
        const rating = ratingsMap.get(`${member.id}:${skill.id}`)
        return (
          <Fragment key={skill.id}>
            <td className="cell-cur">
              <RatingCell
                label="Current"
                value={rating?.current_level ?? null}
                onChange={(v) => onSetLevel(member.id, skill.id, 'current_level', v)}
              />
            </td>
            <td className="cell-tar">
              <RatingCell
                label="Target"
                value={rating?.target_level ?? null}
                onChange={(v) => onSetLevel(member.id, skill.id, 'target_level', v)}
              />
            </td>
          </Fragment>
        )
      })}
    </tr>
  )
}

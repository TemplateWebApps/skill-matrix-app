import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

export default function SkillHeaderCell({ skill, onRemove }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: skill.id,
    data: { type: 'skill' },
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  return (
    <th ref={setNodeRef} style={style} colSpan={2} className="skill-header" {...attributes} {...listeners}>
      <button
        type="button"
        className="skill-remove"
        title="Remove skill"
        onClick={(e) => {
          e.stopPropagation()
          onRemove(skill.id)
        }}
      >
        ×
      </button>
      <span className="skill-name">{skill.name}</span>
    </th>
  )
}

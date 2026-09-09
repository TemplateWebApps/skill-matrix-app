import { Fragment, useEffect, useMemo, useState, useCallback } from 'react'
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  closestCenter,
} from '@dnd-kit/core'
import { SortableContext, verticalListSortingStrategy, horizontalListSortingStrategy, arrayMove } from '@dnd-kit/sortable'
import { useAuth } from '../contexts/AuthContext'
import {
  fetchMatrix,
  addMember,
  updateMember,
  removeMember,
  reorderMembers,
  addSkill,
  removeSkill,
  reorderSkills,
  findOrCreateDepartment,
  setRatingLevel,
} from '../lib/matrixApi'
import MatrixToolbar from '../components/matrix/MatrixToolbar'
import MemberRow from '../components/matrix/MemberRow'
import SkillHeaderCell from '../components/matrix/SkillHeaderCell'
import AddSkillForm from '../components/matrix/AddSkillForm'
import '../components/matrix/matrix.css'

export default function Matrix() {
  const { workspace } = useAuth()
  const [departments, setDepartments] = useState([])
  const [skills, setSkills] = useState([])
  const [members, setMembers] = useState([])
  const [ratings, setRatings] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [showAddSkill, setShowAddSkill] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  const load = useCallback(async () => {
    if (!workspace?.id) return
    setLoading(true)
    try {
      const data = await fetchMatrix(workspace.id)
      setDepartments(data.departments)
      setSkills(data.skills)
      setMembers(data.members)
      setRatings(data.ratings)
      setError(null)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [workspace?.id])

  useEffect(() => {
    load()
  }, [load])

  const ratingsMap = useMemo(() => {
    const map = new Map()
    for (const r of ratings) map.set(`${r.member_id}:${r.skill_id}`, r)
    return map
  }, [ratings])

  const departmentsById = useMemo(() => new Map(departments.map((d) => [d.id, d])), [departments])

  const visibleSkills = useMemo(
    () => (departmentFilter === 'all' ? skills : skills.filter((s) => s.department_id === departmentFilter)),
    [skills, departmentFilter],
  )

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return members
    return members.filter((m) => m.name.toLowerCase().includes(q) || (m.role ?? '').toLowerCase().includes(q))
  }, [members, search])

  const bands = useMemo(() => {
    const result = []
    for (const skill of visibleSkills) {
      const last = result[result.length - 1]
      if (last && last.departmentId === skill.department_id) {
        last.count += 1
      } else {
        result.push({ departmentId: skill.department_id, name: departmentsById.get(skill.department_id)?.name ?? '—', count: 1 })
      }
    }
    return result
  }, [visibleSkills, departmentsById])

  async function handleAddMember() {
    try {
      const created = await addMember(workspace.id, members.length)
      setMembers((prev) => [...prev, created])
    } catch (err) {
      setError(err.message)
    }
  }

  function handleRenameLocal(id, patch) {
    setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
  }

  async function handleRenameCommit(id, patch) {
    try {
      await updateMember(id, patch)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRemoveMember(id) {
    if (!window.confirm('Remove this team member? This deletes all of their ratings too.')) return
    const prev = members
    setMembers((p) => p.filter((m) => m.id !== id))
    try {
      await removeMember(id)
    } catch (err) {
      setError(err.message)
      setMembers(prev)
    }
  }

  async function handleAddSkill({ name, departmentId, newDepartmentName }) {
    try {
      let targetDeptId = departmentId
      let nextDepartments = departments
      if (!targetDeptId && newDepartmentName) {
        const dept = await findOrCreateDepartment(workspace.id, newDepartmentName, departments)
        targetDeptId = dept.id
        nextDepartments = departments.some((d) => d.id === dept.id) ? departments : [...departments, dept]
        setDepartments(nextDepartments)
      }
      await addSkill(workspace.id, targetDeptId, name, skills)
      setShowAddSkill(false)
      await load()
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleRemoveSkill(id) {
    if (!window.confirm('Remove this skill? This deletes all ratings for it too.')) return
    const prev = skills
    setSkills((p) => p.filter((s) => s.id !== id))
    try {
      await removeSkill(id)
    } catch (err) {
      setError(err.message)
      setSkills(prev)
    }
  }

  async function handleSetLevel(memberId, skillId, field, value) {
    setRatings((prev) => {
      const existing = prev.find((r) => r.member_id === memberId && r.skill_id === skillId)
      if (existing) {
        return prev.map((r) => (r === existing ? { ...r, [field]: value } : r))
      }
      return [...prev, { member_id: memberId, skill_id: skillId, current_level: null, target_level: null, [field]: value }]
    })
    try {
      await setRatingLevel(workspace.id, memberId, skillId, field, value)
    } catch (err) {
      setError(err.message)
    }
  }

  function handleDragEnd(event) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const activeType = active.data.current?.type
    if (activeType === 'member') {
      setMembers((prev) => {
        const oldIndex = prev.findIndex((m) => m.id === active.id)
        const newIndex = prev.findIndex((m) => m.id === over.id)
        const next = arrayMove(prev, oldIndex, newIndex)
        reorderMembers(next.map((m) => m.id)).catch((err) => setError(err.message))
        return next
      })
    } else if (activeType === 'skill' && departmentFilter === 'all') {
      setSkills((prev) => {
        const oldIndex = prev.findIndex((s) => s.id === active.id)
        const newIndex = prev.findIndex((s) => s.id === over.id)
        let next = arrayMove(prev, oldIndex, newIndex)

        // Regroup the dragged skill under whichever department it now neighbors.
        const draggedIndex = next.findIndex((s) => s.id === active.id)
        const prevNeighbor = next[draggedIndex - 1]
        const nextNeighbor = next[draggedIndex + 1]
        let newDept = next[draggedIndex].department_id
        if (prevNeighbor && nextNeighbor && prevNeighbor.department_id === nextNeighbor.department_id) {
          newDept = prevNeighbor.department_id
        } else if (prevNeighbor) {
          newDept = prevNeighbor.department_id
        } else if (nextNeighbor) {
          newDept = nextNeighbor.department_id
        }
        next = next.map((s, i) => (i === draggedIndex ? { ...s, department_id: newDept } : s))

        reorderSkills(next.map((s) => ({ id: s.id, department_id: s.department_id }))).catch((err) =>
          setError(err.message),
        )
        return next
      })
    }
  }

  if (loading) return <div className="page-center">Loading matrix…</div>

  return (
    <div className="matrix-page">
      {error && <p className="auth-error matrix-error">{error}</p>}
      <MatrixToolbar
        search={search}
        onSearchChange={setSearch}
        departments={departments}
        departmentFilter={departmentFilter}
        onDepartmentFilterChange={setDepartmentFilter}
        onAddMember={handleAddMember}
        onAddSkill={() => setShowAddSkill(true)}
      />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="matrix-scroll">
          <table className="matrix-table">
            <thead>
              <tr>
                <th className="pinned-corner" rowSpan={3}>
                  Team member
                </th>
                <SortableContext items={visibleSkills.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
                  {bands.map((band, i) => (
                    <th key={i} colSpan={band.count * 2} className={`band-header band-${i % 6}`}>
                      {band.name}
                    </th>
                  ))}
                </SortableContext>
              </tr>
              <tr>
                <SortableContext items={visibleSkills.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
                  {visibleSkills.map((skill) => (
                    <SkillHeaderCell key={skill.id} skill={skill} onRemove={handleRemoveSkill} />
                  ))}
                </SortableContext>
              </tr>
              <tr>
                {visibleSkills.map((skill) => (
                  <Fragment key={skill.id}>
                    <th className="curtar-label">Cur</th>
                    <th className="curtar-label">Tar</th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              <SortableContext items={filteredMembers.map((m) => m.id)} strategy={verticalListSortingStrategy}>
                {filteredMembers.map((member) => (
                  <MemberRow
                    key={member.id}
                    member={member}
                    skills={visibleSkills}
                    ratingsMap={ratingsMap}
                    onRename={handleRenameLocal}
                    onRenameCommit={handleRenameCommit}
                    onRemove={handleRemoveMember}
                    onSetLevel={handleSetLevel}
                  />
                ))}
              </SortableContext>
            </tbody>
          </table>
        </div>
      </DndContext>

      {showAddSkill && (
        <AddSkillForm departments={departments} onSubmit={handleAddSkill} onClose={() => setShowAddSkill(false)} />
      )}
    </div>
  )
}

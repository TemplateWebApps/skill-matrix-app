import { Fragment, useEffect, useMemo, useRef, useState, useCallback } from 'react'
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
  const [addSkillError, setAddSkillError] = useState(null)
  const [addingMember, setAddingMember] = useState(false)
  // A ref, not the state above: several clicks landing in one frame all share
  // the same render's closure, so the state flag still reads false in each of
  // them and the disabled button hasn't re-rendered yet. A ref updates now.
  const addingMemberRef = useRef(false)

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

  // Each department keeps one stable color everywhere it appears, based on
  // its own position among all departments — not on where a given band of
  // columns happens to land, which would make the same department flicker
  // between colors as columns get reordered.
  const BAND_COLOR_COUNT = 8
  const departmentColorIndex = useMemo(
    () => new Map(departments.map((d, i) => [d.id, i % BAND_COLOR_COUNT])),
    [departments],
  )

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
        result.push({
          departmentId: skill.department_id,
          name: departmentsById.get(skill.department_id)?.name ?? '—',
          count: 1,
          colorIndex: departmentColorIndex.get(skill.department_id) ?? 0,
        })
      }
    }
    return result
  }, [visibleSkills, departmentsById, departmentColorIndex])

  async function handleAddMember() {
    // Guarded because impatient double-clicks used to fire several adds off the
    // same render, handing every new row an identical sort_order — which left
    // their order up to the database and made rows swap places between loads.
    if (addingMemberRef.current) return
    addingMemberRef.current = true
    setAddingMember(true)
    try {
      const nextSort = members.reduce((max, m) => Math.max(max, m.sort_order ?? 0), -1) + 1
      const created = await addMember(workspace.id, nextSort)
      setMembers((prev) => [...prev, created])
    } catch (err) {
      setError(err.message)
    } finally {
      addingMemberRef.current = false
      setAddingMember(false)
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
    setAddSkillError(null)
    try {
      let targetDeptId = departmentId
      let nextDepartments = departments
      if (!targetDeptId && newDepartmentName) {
        const dept = await findOrCreateDepartment(workspace.id, newDepartmentName, departments)
        targetDeptId = dept.id
        nextDepartments = departments.some((d) => d.id === dept.id) ? departments : [...departments, dept]
        setDepartments(nextDepartments)
      }
      if (!targetDeptId) {
        setAddSkillError('Pick a department, or give the new one a name.')
        return
      }
      await addSkill(workspace.id, targetDeptId, name, skills)
      setShowAddSkill(false)
      await load()
    } catch (err) {
      setAddSkillError(err.message)
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

    // Everything below reads current state and saves outside of setState on
    // purpose. A state updater has to be a pure function — React may call it
    // more than once for the same update (it deliberately does so in
    // development), and a save fired from inside one runs every time.
    const activeType = active.data.current?.type

    if (activeType === 'member') {
      const oldIndex = members.findIndex((m) => m.id === active.id)
      const newIndex = members.findIndex((m) => m.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      const next = arrayMove(members, oldIndex, newIndex)
      setMembers(next)
      reorderMembers(next.map((m) => m.id)).catch((err) => setError(err.message))
      return
    }

    if (activeType === 'skill' && departmentFilter === 'all') {
      const oldIndex = skills.findIndex((s) => s.id === active.id)
      const newIndex = skills.findIndex((s) => s.id === over.id)
      if (oldIndex === -1 || newIndex === -1) return

      let next = arrayMove(skills, oldIndex, newIndex)

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

      setSkills(next)
      reorderSkills(next).catch((err) => setError(err.message))
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
        addingMember={addingMember}
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
                    <th key={i} colSpan={band.count * 2} className={`band-header band-${band.colorIndex}`}>
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
        <AddSkillForm
          departments={departments}
          error={addSkillError}
          onSubmit={handleAddSkill}
          onClose={() => {
            setShowAddSkill(false)
            setAddSkillError(null)
          }}
        />
      )}
    </div>
  )
}

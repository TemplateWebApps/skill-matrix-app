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
import { useFeedback } from '../contexts/FeedbackContext'
import { useWorkspaceData } from '../contexts/WorkspaceDataContext'
import {
  addMember,
  addDepartment,
  updateMember,
  removeMember,
  reorderMembers,
  addSkill,
  updateSkill,
  removeSkill,
  reorderSkills,
  updateDepartment,
  removeDepartment,
  findOrCreateDepartment,
  setRatingLevel,
} from '../lib/matrixApi'
import MatrixToolbar from '../components/matrix/MatrixToolbar'
import MemberRow from '../components/matrix/MemberRow'
import SkillHeaderCell from '../components/matrix/SkillHeaderCell'
import AddSkillForm from '../components/matrix/AddSkillForm'
import AddMemberForm from '../components/matrix/AddMemberForm'
import AddCategoryForm from '../components/matrix/AddCategoryForm'
import ManagePanel from '../components/matrix/ManagePanel'
import '../components/matrix/matrix.css'

export default function Matrix() {
  const { workspace } = useAuth()
  const { confirm, toast } = useFeedback()
  const {
    departments,
    skills,
    members,
    ratings,
    setDepartments,
    setSkills,
    setMembers,
    setRatings,
    reload: load,
    loading,
    error,
    setError,
  } = useWorkspaceData()
  const [search, setSearch] = useState('')
  const [departmentFilter, setDepartmentFilter] = useState('all')
  const [showAddSkill, setShowAddSkill] = useState(false)
  const [addSkillFor, setAddSkillFor] = useState(null) // department preselected by a "+" in its bar
  const [addSkillError, setAddSkillError] = useState(null)
  const [savingSkill, setSavingSkill] = useState(false)
  const [showAddMember, setShowAddMember] = useState(false)
  const [addMemberError, setAddMemberError] = useState(null)
  const [showAddCategory, setShowAddCategory] = useState(false)
  const [addCategoryError, setAddCategoryError] = useState(null)
  const [savingCategory, setSavingCategory] = useState(false)
  // Which rating popover is open, held once for the whole grid rather than in
  // every cell. Format: "<memberId>:<skillId>:<field>".
  const [openCellKey, setOpenCellKey] = useState(null)
  const [showManage, setShowManage] = useState(false)
  const [manageError, setManageError] = useState(null)
  const [addingMember, setAddingMember] = useState(false)
  // A ref, not the state above: several clicks landing in one frame all share
  // the same render's closure, so the state flag still reads false in each of
  // them and the disabled button hasn't re-rendered yet. A ref updates now.
  const addingMemberRef = useRef(false)
  // Last name actually saved for each member, so a cleared field can be put
  // back without a round trip.
  const savedMemberNames = useRef(new Map())
  const membersRef = useRef([])

  const workspaceId = workspace?.id
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  // Keep the "last saved name" map and the rollback snapshot in step with
  // whatever the shared store holds.
  useEffect(() => {
    savedMemberNames.current = new Map(members.map((m) => [m.id, m.name]))
    membersRef.current = members
  }, [members])

  // One listener for the whole grid instead of one per open cell. A mousedown
  // inside any cell is left alone so the button's own click can toggle it.
  useEffect(() => {
    if (!openCellKey) return
    const onDown = (e) => {
      if (!e.target.closest?.('.rating-cell')) setOpenCellKey(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [openCellKey])

  const handleToggleCell = useCallback((memberId, skillId, field) => {
    const key = `${memberId}:${skillId}:${field}`
    setOpenCellKey((open) => (open === key ? null : key))
  }, [])

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

  // Categories with nothing in them still get a bar, so you can create one and
  // then fill it — the way a spreadsheet shows an empty column heading.
  const emptyDepartments = useMemo(() => {
    const withSkills = new Set(skills.map((s) => s.department_id))
    return departments
      .filter((d) => !withSkills.has(d.id))
      .filter((d) => departmentFilter === 'all' || d.id === departmentFilter)
  }, [departments, skills, departmentFilter])

  function openAddSkillFor(departmentId) {
    setAddSkillError(null)
    setAddSkillFor(departmentId ?? null)
    setShowAddSkill(true)
  }

  async function handleAddMember({ name, role }) {
    // Guarded because impatient double-clicks used to fire several adds off the
    // same render, handing every new row an identical sort_order — which left
    // their order up to the database and made rows swap places between loads.
    if (addingMemberRef.current) return
    addingMemberRef.current = true
    setAddingMember(true)
    setAddMemberError(null)
    try {
      const nextSort = members.reduce((max, m) => Math.max(max, m.sort_order ?? 0), -1) + 1
      const created = await addMember(workspace.id, nextSort, { name, role })
      savedMemberNames.current.set(created.id, created.name)
      setMembers((prev) => [...prev, created])
      setShowAddMember(false)
      toast(`${created.name} added`)
    } catch (err) {
      setAddMemberError(err.message)
    } finally {
      addingMemberRef.current = false
      setAddingMember(false)
    }
  }

  async function handleAddCategory(name) {
    setSavingCategory(true)
    setAddCategoryError(null)
    try {
      const created = await addDepartment(workspace.id, name, departments)
      setDepartments((prev) => [...prev, created])
      setShowAddCategory(false)
      toast(`${created.name} added`)
    } catch (err) {
      setAddCategoryError(err.message)
    } finally {
      setSavingCategory(false)
    }
  }

  const handleRenameLocal = useCallback(
    (id, patch) => {
      setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, ...patch } : m)))
    },
    [setMembers],
  )

  const handleRenameCommit = useCallback(
    async (id, patch) => {
      // A blank name leaves a row nobody can identify or search for, so put
      // back what was there rather than saving nothing.
      if ('name' in patch && !patch.name.trim()) {
        const saved = savedMemberNames.current.get(id)
        setMembers((prev) => prev.map((m) => (m.id === id ? { ...m, name: saved ?? 'Unnamed' } : m)))
        return
      }

      const patchToSave = 'name' in patch ? { name: patch.name.trim() } : patch
      if ('name' in patchToSave) savedMemberNames.current.set(id, patchToSave.name)

      try {
        await updateMember(id, patchToSave)
      } catch (err) {
        setError(err.message)
      }
    },
    [setMembers, setError],
  )

  // Takes the name as an argument rather than looking it up in `members`, so
  // its identity stays stable and the memoised rows actually skip re-rendering.
  const handleRemoveMember = useCallback(
    async (id, name) => {
      const ok = await confirm({
        title: `Remove ${name || 'this person'}?`,
        message: 'Their ratings across every skill will be deleted too. This cannot be undone.',
        confirmLabel: 'Remove',
        destructive: true,
      })
      if (!ok) return

      const previous = membersRef.current
      setMembers((p) => p.filter((m) => m.id !== id))
      try {
        await removeMember(id)
        toast(`${name || 'Person'} removed`)
      } catch (err) {
        setError(err.message)
        setMembers(previous)
      }
    },
    [confirm, toast, setMembers, setError],
  )

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
        setAddSkillError('Pick a category, or give the new one a name.')
        return
      }
      setSavingSkill(true)
      // Use the order addSkill worked out rather than refetching the whole
      // workspace — that round trip was what made adding feel slow.
      const { created, order } = await addSkill(workspace.id, targetDeptId, name, skills)
      setSkills(order)
      setShowAddSkill(false)
      setAddSkillFor(null)
      toast(`${created.name} added`)
    } catch (err) {
      setAddSkillError(err.message)
    } finally {
      setSavingSkill(false)
    }
  }

  async function handleRenameSkill(id, name) {
    const prev = skills
    setManageError(null)
    setSkills((p) => p.map((s) => (s.id === id ? { ...s, name } : s)))
    try {
      await updateSkill(id, { name })
    } catch (err) {
      setManageError(err.message)
      setSkills(prev)
    }
  }

  async function handleRenameDepartment(id, name) {
    const prev = departments
    setManageError(null)
    setDepartments((p) => p.map((d) => (d.id === id ? { ...d, name } : d)))
    try {
      await updateDepartment(id, { name })
    } catch (err) {
      setManageError(err.message)
      setDepartments(prev)
    }
  }

  async function handleDeleteDepartment(dept, skillCount) {
    const ok = await confirm({
      title: `Delete ${dept.name}?`,
      message:
        skillCount > 0
          ? `Its ${skillCount} ${skillCount === 1 ? 'skill' : 'skills'} will be deleted as well, along with every rating on them. This cannot be undone.`
          : 'This department has no skills in it. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return

    setManageError(null)
    try {
      await removeDepartment(dept.id)
      await load()
      toast(`${dept.name} deleted`)
    } catch (err) {
      setManageError(err.message)
    }
  }

  async function handleDeleteSkillFromPanel(skill) {
    const ok = await confirm({
      title: `Delete ${skill.name}?`,
      message: 'Every rating on this skill will be deleted too. This cannot be undone.',
      confirmLabel: 'Delete',
      destructive: true,
    })
    if (!ok) return

    setManageError(null)
    try {
      await removeSkill(skill.id)
      await load()
      toast(`${skill.name} deleted`)
    } catch (err) {
      setManageError(err.message)
    }
  }

  async function handleRemoveSkill(id) {
    const skill = skills.find((s) => s.id === id)
    const ok = await confirm({
      title: `Remove ${skill?.name || 'this skill'}?`,
      message: 'Every rating on this skill will be deleted too. This cannot be undone.',
      confirmLabel: 'Remove',
      destructive: true,
    })
    if (!ok) return

    const prev = skills
    setSkills((p) => p.filter((s) => s.id !== id))
    try {
      await removeSkill(id)
      toast(`${skill?.name || 'Skill'} removed`)
    } catch (err) {
      setError(err.message)
      setSkills(prev)
    }
  }

  // Stable identity so memoised rows and cells aren't re-rendered by every
  // unrelated state change in this component.
  const handlePickLevel = useCallback(
    async (memberId, skillId, field, value) => {
      setOpenCellKey(null)
      setRatings((prev) => {
        const existing = prev.find((r) => r.member_id === memberId && r.skill_id === skillId)
        if (existing) {
          return prev.map((r) => (r === existing ? { ...r, [field]: value } : r))
        }
        return [
          ...prev,
          { member_id: memberId, skill_id: skillId, current_level: null, target_level: null, [field]: value },
        ]
      })
      try {
        await setRatingLevel(workspaceId, memberId, skillId, field, value)
      } catch (err) {
        setError(err.message)
      }
    },
    [workspaceId, setRatings, setError],
  )

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
        onAddMember={() => {
          setAddMemberError(null)
          setShowAddMember(true)
        }}
        addingMember={addingMember}
        onAddSkill={() => openAddSkillFor(null)}
        onManage={() => setShowManage(true)}
      />

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <div className="matrix-scroll">
          <table className="matrix-table">
            <thead>
              <tr>
                <th className="pinned-corner" rowSpan={3}>
                  <span className="corner-label">Team member</span>
                  <button
                    type="button"
                    className="corner-add"
                    title="Add a team member"
                    onClick={() => {
                      setAddMemberError(null)
                      setShowAddMember(true)
                    }}
                  >
                    +
                  </button>
                </th>
                <SortableContext items={visibleSkills.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
                  {bands.map((band, i) => (
                    <th key={i} colSpan={band.count * 2} className={`band-header band-${band.colorIndex}`}>
                      <span className="band-name">{band.name}</span>
                      <button
                        type="button"
                        className="band-add"
                        title={`Add a skill to ${band.name}`}
                        onClick={() => openAddSkillFor(band.departmentId)}
                      >
                        +
                      </button>
                    </th>
                  ))}
                </SortableContext>
                {emptyDepartments.map((dept) => (
                  <th
                    key={dept.id}
                    className={`band-header band-${departmentColorIndex.get(dept.id) ?? 0}`}
                  >
                    <span className="band-name">{dept.name}</span>
                    <button
                      type="button"
                      className="band-add"
                      title={`Add a skill to ${dept.name}`}
                      onClick={() => openAddSkillFor(dept.id)}
                    >
                      +
                    </button>
                  </th>
                ))}
                <th className="add-category-col" rowSpan={3}>
                  <button
                    type="button"
                    className="add-category-btn"
                    title="Add a category"
                    onClick={() => {
                      setAddCategoryError(null)
                      setShowAddCategory(true)
                    }}
                  >
                    + Category
                  </button>
                </th>
              </tr>
              <tr>
                <SortableContext items={visibleSkills.map((s) => s.id)} strategy={horizontalListSortingStrategy}>
                  {visibleSkills.map((skill) => (
                    <SkillHeaderCell key={skill.id} skill={skill} onRemove={handleRemoveSkill} />
                  ))}
                </SortableContext>
                {emptyDepartments.map((dept) => (
                  <th key={dept.id} className="skill-header empty-dept">
                    <button type="button" className="empty-dept-add" onClick={() => openAddSkillFor(dept.id)}>
                      + Skill
                    </button>
                  </th>
                ))}
              </tr>
              <tr>
                {visibleSkills.map((skill) => (
                  <Fragment key={skill.id}>
                    <th className="curtar-label">Cur</th>
                    <th className="curtar-label">Tar</th>
                  </Fragment>
                ))}
                {emptyDepartments.map((dept) => (
                  <th key={dept.id} className="curtar-label" />
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
                    emptyDepartments={emptyDepartments}
                    ratingsMap={ratingsMap}
                    rowOpenKey={openCellKey?.startsWith(`${member.id}:`) ? openCellKey : null}
                    onToggleCell={handleToggleCell}
                    onPickLevel={handlePickLevel}
                    onRename={handleRenameLocal}
                    onRenameCommit={handleRenameCommit}
                    onRemove={handleRemoveMember}
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
          defaultDepartmentId={addSkillFor}
          error={addSkillError}
          saving={savingSkill}
          onSubmit={handleAddSkill}
          onClose={() => {
            setShowAddSkill(false)
            setAddSkillFor(null)
            setAddSkillError(null)
          }}
        />
      )}

      {showAddMember && (
        <AddMemberForm
          error={addMemberError}
          saving={addingMember}
          onSubmit={handleAddMember}
          onClose={() => {
            setShowAddMember(false)
            setAddMemberError(null)
          }}
        />
      )}

      {showAddCategory && (
        <AddCategoryForm
          error={addCategoryError}
          saving={savingCategory}
          onSubmit={handleAddCategory}
          onClose={() => {
            setShowAddCategory(false)
            setAddCategoryError(null)
          }}
        />
      )}

      {showManage && (
        <ManagePanel
          departments={departments}
          skills={skills}
          error={manageError}
          onRenameDepartment={handleRenameDepartment}
          onDeleteDepartment={handleDeleteDepartment}
          onRenameSkill={handleRenameSkill}
          onDeleteSkill={handleDeleteSkillFromPanel}
          onClose={() => {
            setShowManage(false)
            setManageError(null)
          }}
        />
      )}
    </div>
  )
}

import { supabase } from './supabaseClient'

export async function fetchMatrix(workspaceId) {
  const [departmentsRes, skillsRes, membersRes, ratingsRes] = await Promise.all([
    supabase.from('departments').select('*').eq('workspace_id', workspaceId).order('sort_order'),
    supabase.from('skills').select('*').eq('workspace_id', workspaceId).order('sort_order'),
    supabase.from('members').select('*').eq('workspace_id', workspaceId).order('sort_order'),
    supabase.from('ratings').select('*').eq('workspace_id', workspaceId),
  ])

  for (const res of [departmentsRes, skillsRes, membersRes, ratingsRes]) {
    if (res.error) throw res.error
  }

  return {
    departments: departmentsRes.data,
    skills: skillsRes.data,
    members: membersRes.data,
    ratings: ratingsRes.data,
  }
}

export async function addMember(workspaceId, sortOrder, { name = 'New member', role = '' } = {}) {
  const { data, error } = await supabase
    .from('members')
    .insert({ workspace_id: workspaceId, name, role, sort_order: sortOrder })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function addDepartment(workspaceId, name, existingDepartments) {
  const maxSort = existingDepartments.reduce((max, d) => Math.max(max, d.sort_order ?? 0), -1)
  const { data, error } = await supabase
    .from('departments')
    .insert({ workspace_id: workspaceId, name: name.trim(), sort_order: maxSort + 1 })
    .select()
    .single()
  if (error) throw error
  return data
}

export async function updateMember(id, patch) {
  const { error } = await supabase.from('members').update(patch).eq('id', id)
  if (error) throw error
}

export async function removeMember(id) {
  const { error } = await supabase.from('members').delete().eq('id', id)
  if (error) throw error
}

// One request for the whole new order rather than one per row — a 30-person
// list was firing 30 separate updates for a single drag.
export async function reorderMembers(orderedMembers) {
  const rows = orderedMembers.map((m, index) => ({
    id: m.id,
    workspace_id: m.workspace_id,
    name: m.name,
    role: m.role,
    sort_order: index,
  }))
  const { error } = await supabase.from('members').upsert(rows)
  if (error) throw error
}

// Finds (or creates) a department by name within a workspace.
export async function findOrCreateDepartment(workspaceId, name, existingDepartments) {
  const match = existingDepartments.find((d) => d.name.toLowerCase() === name.trim().toLowerCase())
  if (match) return match

  const maxSort = existingDepartments.reduce((max, d) => Math.max(max, d.sort_order), -1)
  const { data, error } = await supabase
    .from('departments')
    .insert({ workspace_id: workspaceId, name: name.trim(), sort_order: maxSort + 1 })
    .select()
    .single()
  if (error) throw error
  return data
}

// Appends a new skill immediately after the last existing skill of its department
// (or at the very end if the department has no skills yet), then renumbers
// sort_order for every skill so the department stays contiguous.
export async function addSkill(workspaceId, departmentId, name, allSkills) {
  let insertAt = allSkills.length
  for (let i = allSkills.length - 1; i >= 0; i--) {
    if (allSkills[i].department_id === departmentId) {
      insertAt = i + 1
      break
    }
  }

  const newOrder = [...allSkills]
  newOrder.splice(insertAt, 0, { id: '__new__', department_id: departmentId })

  const { data: created, error: insertError } = await supabase
    .from('skills')
    .insert({ workspace_id: workspaceId, department_id: departmentId, name: name.trim(), sort_order: insertAt })
    .select()
    .single()
  if (insertError) throw insertError

  // reorderSkills upserts whole rows, so hand it the real ones.
  const finalOrder = newOrder
    .map((s) => (s.id === '__new__' ? created : s))
    .map((s, i) => ({ ...s, sort_order: i }))
  await reorderSkills(finalOrder)

  // Hand back the finished order too, so callers can update their state
  // directly instead of refetching the whole workspace.
  return { created, order: finalOrder }
}

export async function updateSkill(id, patch) {
  const { error } = await supabase.from('skills').update(patch).eq('id', id)
  if (error) throw error
}

export async function updateDepartment(id, patch) {
  const { error } = await supabase.from('departments').update(patch).eq('id', id)
  if (error) throw error
}

// Deleting a department takes its skills with it (and their ratings), because
// a skill can't exist without one. Callers must warn before calling this.
export async function removeDepartment(id) {
  const { error } = await supabase.from('departments').delete().eq('id', id)
  if (error) throw error
}

export async function removeSkill(id) {
  const { error } = await supabase.from('skills').delete().eq('id', id)
  if (error) throw error
}

// orderedSkills: full skill rows in final display order.
export async function reorderSkills(orderedSkills) {
  const rows = orderedSkills.map((s, index) => ({
    id: s.id,
    workspace_id: s.workspace_id,
    department_id: s.department_id,
    name: s.name,
    sort_order: index,
  }))
  const { error } = await supabase.from('skills').upsert(rows)
  if (error) throw error
}

// field is 'current_level' or 'target_level'. value is null or 1-4.
export async function setRatingLevel(workspaceId, memberId, skillId, field, value) {
  const { error } = await supabase
    .from('ratings')
    .upsert({ workspace_id: workspaceId, member_id: memberId, skill_id: skillId, [field]: value }, { onConflict: 'member_id,skill_id' })
  if (error) throw error
}

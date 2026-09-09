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

export async function addMember(workspaceId, sortOrder) {
  const { data, error } = await supabase
    .from('members')
    .insert({ workspace_id: workspaceId, name: 'New member', role: '', sort_order: sortOrder })
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

export async function reorderMembers(orderedIds) {
  const results = await Promise.all(
    orderedIds.map((id, index) => supabase.from('members').update({ sort_order: index }).eq('id', id)),
  )
  const failed = results.find((r) => r.error)
  if (failed) throw failed.error
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

  const finalOrder = newOrder.map((s) => (s.id === '__new__' ? created : s))
  await reorderSkills(finalOrder.map((s) => ({ id: s.id, department_id: s.department_id })))

  return created
}

export async function removeSkill(id) {
  const { error } = await supabase.from('skills').delete().eq('id', id)
  if (error) throw error
}

// orderedSkills: [{ id, department_id }] in final display order.
export async function reorderSkills(orderedSkills) {
  const results = await Promise.all(
    orderedSkills.map((s, index) =>
      supabase.from('skills').update({ sort_order: index, department_id: s.department_id }).eq('id', s.id),
    ),
  )
  const failed = results.find((r) => r.error)
  if (failed) throw failed.error
}

// field is 'current_level' or 'target_level'. value is null or 1-4.
export async function setRatingLevel(workspaceId, memberId, skillId, field, value) {
  const { error } = await supabase
    .from('ratings')
    .upsert({ workspace_id: workspaceId, member_id: memberId, skill_id: skillId, [field]: value }, { onConflict: 'member_id,skill_id' })
  if (error) throw error
}

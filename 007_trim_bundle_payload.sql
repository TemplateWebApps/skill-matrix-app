-- ============================================================================
-- Skill Matrix — Send only the rating fields the app actually uses
--
-- WHY: the bundle returned every column of every rating, including three the
-- app never reads — the row's own id, the workspace id (identical on every
-- row, and already known), and updated_at. On a big matrix the ratings are by
-- far the largest part of the response, so those three columns are most of
-- what's being sent.
--
-- A workspace with 65 people and 80 skills has roughly 5,000 ratings. Trimming
-- those fields takes that part of the response from about 1.2 MB to 600 KB.
-- That's download time on every app open, and it's metered bandwidth.
--
-- Nothing else changes: same function, same shape, fewer fields per rating.
--
-- HOW TO RUN IT: Supabase dashboard -> skill-matrix-beta -> SQL Editor ->
-- New query -> paste -> Run. "Success. No rows returned."
-- ============================================================================

create or replace function get_workspace_bundle(p_workspace_id uuid default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_ws  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select wm.workspace_id into v_ws
  from workspace_members wm
  where wm.user_id = v_uid
    and (p_workspace_id is null or wm.workspace_id = p_workspace_id)
  order by wm.created_at
  limit 1;

  if v_ws is null and p_workspace_id is not null then
    select wm.workspace_id into v_ws
    from workspace_members wm
    where wm.user_id = v_uid
    order by wm.created_at
    limit 1;
  end if;

  return jsonb_build_object(
    'workspace_id', v_ws,

    'workspaces', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', w.id,
                 'name', w.name,
                 'owner_id', w.owner_id,
                 'created_at', w.created_at,
                 'role', wm.role
               ) order by wm.created_at)
      from workspace_members wm
      join workspaces w on w.id = wm.workspace_id
      where wm.user_id = v_uid
    ), '[]'::jsonb),

    'departments', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', d.id, 'workspace_id', d.workspace_id,
               'name', d.name, 'sort_order', d.sort_order
             ) order by d.sort_order)
      from departments d where d.workspace_id = v_ws
    ), '[]'::jsonb),

    'skills', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', s.id, 'workspace_id', s.workspace_id,
               'department_id', s.department_id,
               'name', s.name, 'sort_order', s.sort_order
             ) order by s.sort_order)
      from skills s where s.workspace_id = v_ws
    ), '[]'::jsonb),

    'members', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', m.id, 'workspace_id', m.workspace_id,
               'name', m.name, 'role', m.role, 'sort_order', m.sort_order
             ) order by m.sort_order)
      from members m where m.workspace_id = v_ws
    ), '[]'::jsonb),

    -- The big one. Only the four fields the grid reads.
    'ratings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', r.member_id,
               'skill_id', r.skill_id,
               'current_level', r.current_level,
               'target_level', r.target_level
             ))
      from ratings r where r.workspace_id = v_ws
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function get_workspace_bundle(uuid) from public;
grant execute on function get_workspace_bundle(uuid) to authenticated;

-- ============================================================================
-- DONE.
-- ============================================================================

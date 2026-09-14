-- ============================================================================
-- Skill Matrix — Load the whole workspace in one request
--
-- WHY: opening the app took two round trips to the database, one after the
-- other. First "which workspaces am I in?", and only once that came back could
-- it ask for the departments, skills, people and ratings — because it didn't
-- know which workspace to ask about yet. The second trip couldn't start until
-- the first finished, so its whole duration was dead time.
--
-- This function answers both questions at once, so opening the app is a single
-- request instead of two waiting in line.
--
-- It's security definer (it runs with elevated rights), so it checks
-- membership itself: every query below is restricted to workspaces the calling
-- user actually belongs to, and asking for someone else's workspace quietly
-- returns your own instead of theirs.
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

  -- The requested workspace, but only if the caller is a member of it.
  select wm.workspace_id into v_ws
  from workspace_members wm
  where wm.user_id = v_uid
    and (p_workspace_id is null or wm.workspace_id = p_workspace_id)
  order by wm.created_at
  limit 1;

  -- Asked for one they don't belong to: fall back to their own first
  -- workspace rather than failing or leaking anything.
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
      select jsonb_agg(to_jsonb(d) order by d.sort_order)
      from departments d where d.workspace_id = v_ws
    ), '[]'::jsonb),

    'skills', coalesce((
      select jsonb_agg(to_jsonb(s) order by s.sort_order)
      from skills s where s.workspace_id = v_ws
    ), '[]'::jsonb),

    'members', coalesce((
      select jsonb_agg(to_jsonb(m) order by m.sort_order)
      from members m where m.workspace_id = v_ws
    ), '[]'::jsonb),

    'ratings', coalesce((
      select jsonb_agg(to_jsonb(r))
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

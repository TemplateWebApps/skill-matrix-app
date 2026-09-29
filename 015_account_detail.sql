-- ============================================================================
-- Skill Matrix — Upgrade date and audit trail (015)
--
-- WHAT CHANGES ON THE ADMIN SCREEN
--   Signed up   when they first registered            (already there)
--   Upgraded    when they became a paying workspace   (new; blank while free)
--   ×N          a mark when a workspace has changed plan more than once
--   Details     opens the full audit trail for that workspace
--
-- HOW "UPGRADED" IS WORKED OUT
-- The most recent move onto a paid plan. So a workspace that paid, left, and
-- came back shows the date it came back — which is what its current status
-- actually rests on — and the ×N mark plus the audit trail tell you the rest.
-- A workspace that is currently paid but has no logged change falls back to
-- the date it was created, which covers going straight to paid at signup.
--
-- Blank means never paid. Not "unknown" — never.
--
-- HOW TO RUN IT: https://supabase.com/dashboard/project/mhubibyupkcdnlvzeaau/sql/new
-- Run 014 first. Safe to run more than once.
-- ============================================================================


-- ---------- 1. The list, with an upgrade date -------------------------------
-- The return type changes, so the old version has to go first.

drop function if exists admin_list_accounts();

create or replace function admin_list_accounts()
returns table (
  user_id        uuid,
  email          text,
  signed_up      timestamptz,
  last_sign_in   timestamptz,
  confirmed      boolean,
  workspace_id   uuid,
  workspace_name text,
  role           text,
  plan           text,
  upgraded_at    timestamptz,
  plan_changes   int,
  people         int,
  skills         int,
  ratings_filled int
)
language plpgsql
security definer
stable
set search_path = public
as $fn$
begin
  if not is_app_admin() then
    raise exception 'not_an_admin' using errcode = 'P0001';
  end if;

  return query
  select
    u.id,
    u.email::text,
    u.created_at,
    u.last_sign_in_at,
    (u.email_confirmed_at is not null),
    w.id,
    w.name,
    wm.role,
    w.plan,
    coalesce(
      -- The most recent time this workspace moved onto a paid plan.
      (select ph.changed_at from plan_history ph
        where ph.workspace_id = w.id and ph.to_plan <> 'free'
        order by ph.changed_at desc limit 1),
      -- Paid with nothing logged means it was created that way — someone who
      -- went straight to paid at signup, whose upgrade date is their signup
      -- date.
      case when w.plan is not null and w.plan <> 'free' then w.created_at end
    ),
    (select count(*)::int from plan_history ph where ph.workspace_id = w.id),
    (select count(*)::int from members m where m.workspace_id = w.id),
    (select count(*)::int from skills  s where s.workspace_id = w.id),
    (select count(*)::int from ratings r
       where r.workspace_id = w.id and r.current_level is not null)
  from auth.users u
  left join workspace_members wm on wm.user_id = u.id
  left join workspaces w on w.id = wm.workspace_id
  order by u.created_at desc;
end;
$fn$;

revoke all on function admin_list_accounts() from public;
grant execute on function admin_list_accounts() to authenticated;


-- ---------- 2. The audit trail ----------------------------------------------
-- Its own call rather than riding along in the list. Most workspaces have no
-- history at all, and the list is fetched every time the page opens, so
-- carrying everyone's history in it would pay for something almost nobody
-- looks at. This runs only when someone clicks Details.
--
-- The workspace's creation is included as the first entry, so the trail reads
-- as a complete story rather than starting mid-way.

create or replace function admin_workspace_history(p_workspace_id uuid)
returns table (
  changed_at timestamptz,
  from_plan  text,
  to_plan    text,
  changed_by text,
  is_created boolean
)
language plpgsql
security definer
stable
set search_path = public
as $fn$
begin
  if not is_app_admin() then
    raise exception 'not_an_admin' using errcode = 'P0001';
  end if;

  return query
  select w.created_at, null::text, w.plan, null::text, true
    from workspaces w
   where w.id = p_workspace_id
  union all
  select ph.changed_at, ph.from_plan, ph.to_plan, ph.changed_by, false
    from plan_history ph
   where ph.workspace_id = p_workspace_id
  order by 1 desc;
end;
$fn$;

revoke all on function admin_workspace_history(uuid) from public;
grant execute on function admin_workspace_history(uuid) to authenticated;


-- ---------- 3. Did it work? -------------------------------------------------

select
  (select count(*) from pg_proc where proname = 'admin_list_accounts')    as fn_list,     -- 1
  (select count(*) from pg_proc where proname = 'admin_workspace_history') as fn_history, -- 1
  (select count(*) from plan_history)                                      as changes_logged;

-- ============================================================================
-- DONE. The first plan change you make will be the first audit-trail entry.
-- The workspace-created line appears for everyone straight away.
-- ============================================================================

-- ============================================================================
-- Skill Matrix — Admin page (013)
--
-- WHAT THIS ADDS
-- One screen showing every account: email, when they signed up, when they last
-- signed in, which workspace they're in, what plan it's on, and how much they
-- have actually built. Plus a control to move a workspace between plans.
--
-- WHY THE CHECK IS DOWN HERE AND NOT IN THE APP
-- This is the most dangerous screen in the product: it lists everyone's email
-- and can change what people are paying for. Hiding a link in the app stops
-- nobody — anyone can call the endpoint directly with the key their browser
-- already has. So every function below refuses outright unless the caller is
-- on the admin list, and the app's version of that check is only there to
-- decide whether to draw the tab.
--
-- WHO IS AN ADMIN
-- Seeded with templatewebapps@gmail.com. To add yourself under another
-- address, see the snippet at the bottom.
--
-- WHAT YOU CANNOT SEE, HERE OR ANYWHERE
-- Passwords. They're hashed, by design — Supabase can't read them either. If
-- someone is locked out, send a reset link.
--
-- HOW TO RUN IT: Supabase dashboard -> skill-matrix-beta -> SQL Editor ->
-- New query -> paste -> Run. Prints a row of checks at the end.
-- Safe to run more than once. Run 012 first.
-- ============================================================================


-- ---------- 1. Who counts as an admin ---------------------------------------

create table if not exists app_admins (
  email      text primary key,
  created_at timestamptz not null default now()
);

alter table app_admins enable row level security;
-- No policies at all, deliberately. Nothing reaches this table except the
-- security-definer functions below, so a signed-in user can't read the admin
-- list or add themselves to it.

insert into app_admins (email) values ('templatewebapps@gmail.com')
  on conflict (email) do nothing;


create or replace function is_app_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $fn$
  select exists (
    select 1
    from auth.users u
    join app_admins a on lower(a.email) = lower(u.email)
    where u.id = auth.uid()
  );
$fn$;

revoke all on function is_app_admin() from public;
grant execute on function is_app_admin() to authenticated;


-- ---------- 2. Let an admin change a plan -----------------------------------
-- 008 blocks plan changes from any signed-in user, which is what stops someone
-- upgrading themselves for free. Admins are the exception — without this, the
-- admin screen could read plans but never change one.

create or replace function guard_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.plan is distinct from old.plan
     and auth.uid() is not null
     and not is_app_admin() then
    raise exception 'A workspace plan can only be changed by billing.'
      using errcode = 'P0001', hint = 'plan_change_not_allowed';
  end if;
  return new;
end;
$fn$;

drop trigger if exists workspaces_guard_plan on workspaces;
create trigger workspaces_guard_plan
  before update on workspaces
  for each row execute function guard_plan_change();


-- ---------- 3. The list -----------------------------------------------------
-- One row per workspace membership. Someone in two workspaces appears twice,
-- which is correct: the plan belongs to the workspace, not the person.

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


-- ---------- 4. The plan control ---------------------------------------------

create or replace function admin_set_plan(p_workspace_id uuid, p_plan text)
returns text
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if not is_app_admin() then
    raise exception 'not_an_admin' using errcode = 'P0001';
  end if;

  if p_plan not in ('free', 'unlimited') then
    raise exception 'plan must be free or unlimited' using errcode = 'P0001';
  end if;

  update workspaces set plan = p_plan where id = p_workspace_id;
  if not found then
    raise exception 'no such workspace' using errcode = 'P0001';
  end if;

  return p_plan;
end;
$fn$;

revoke all on function admin_set_plan(uuid, text) from public;
grant execute on function admin_set_plan(uuid, text) to authenticated;


-- ---------- 5. Tell the app whether to draw the tab -------------------------
-- Same bundle as before with one field added, so this costs no extra request.

create or replace function get_workspace_bundle(p_workspace_id uuid default null)
returns jsonb
language plpgsql
security definer
stable
set search_path = public
as $fn$
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
    'is_admin', is_app_admin(),

    'workspaces', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', w.id, 'name', w.name, 'owner_id', w.owner_id,
                 'created_at', w.created_at, 'plan', w.plan, 'role', wm.role
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

    'ratings', coalesce((
      select jsonb_agg(jsonb_build_object(
               'member_id', r.member_id, 'skill_id', r.skill_id,
               'current_level', r.current_level, 'target_level', r.target_level
             ))
      from ratings r where r.workspace_id = v_ws
    ), '[]'::jsonb)
  );
end;
$fn$;

revoke all on function get_workspace_bundle(uuid) from public;
grant execute on function get_workspace_bundle(uuid) to authenticated;


-- ---------- 6. Did it work? -------------------------------------------------

select
  (select count(*) from app_admins)                          as admins,        -- expected 1+
  (select count(*) from pg_proc where proname = 'is_app_admin')       as fn_is_admin,   -- 1
  (select count(*) from pg_proc where proname = 'admin_list_accounts') as fn_list,      -- 1
  (select count(*) from pg_proc where proname = 'admin_set_plan')      as fn_set_plan,  -- 1
  (select count(*) from pg_policies where tablename = 'app_admins')    as admin_policies; -- 0 is correct

-- ============================================================================
-- DONE.
--
-- TO ADD ANOTHER ADMIN (use the address you actually sign in with):
--
--   insert into app_admins (email) values ('you@example.com')
--     on conflict (email) do nothing;
--
-- TO REMOVE ONE:
--
--   delete from app_admins where email = 'someone@example.com';
--
-- Admin is per email address, so a test account you sign up with will NOT be
-- an admin unless you add it here. That's deliberate — it's how you see the
-- app the way a tester sees it.
-- ============================================================================

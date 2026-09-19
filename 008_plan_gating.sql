-- ============================================================================
-- Skill Matrix — Plan limits (008)
--
-- WHAT THIS DOES
-- The landing page advertises three tiers. Until now that was marketing only:
-- nothing in the app or the database stopped a Free workspace adding 500
-- people and 40 categories. This migration makes the tiers real.
--
--   Free       25 people,  1 category
--   Plus      100 people,  unlimited categories
--   Unlimited  unlimited,  unlimited
--
-- WHY IT'S ENFORCED HERE AND NOT JUST IN THE APP
-- The browser holds the anon key, so anyone can talk to the database directly
-- without going through our screens. A limit that only exists in JavaScript is
-- a suggestion. These triggers are the actual gate; the app's upgrade prompts
-- are just a politer way of hitting the same wall.
--
-- EXISTING WORKSPACES ARE NOT AFFECTED
-- Every workspace that exists right now is set to 'unlimited' below. Nobody
-- signed up under these limits, so nobody gets squeezed by them. Only accounts
-- created from now on start on Free.
--
-- HOW TO RUN IT: Supabase dashboard -> skill-matrix-beta -> SQL Editor ->
-- New query -> paste the whole file -> Run.
--
-- It finishes by printing a single row of checks, so you can see it worked
-- rather than having to take my word for it. The expected numbers are written
-- next to that query at the bottom.
--
-- Safe to run more than once. Every step either creates something or replaces
-- it, so a re-run after a failure leaves you in the same place as a clean run.
-- ============================================================================


-- ---------- 1. The plan itself ----------------------------------------------

alter table workspaces add column if not exists plan text not null default 'free';

alter table workspaces drop constraint if exists workspaces_plan_check;
alter table workspaces add constraint workspaces_plan_check
  check (plan in ('free', 'plus', 'unlimited'));

-- Grandfather everyone who is already here. The date is what makes this safe
-- to run twice: a real Free account signing up next week is created after it
-- and so is never swept up by a re-run.
update workspaces
   set plan = 'unlimited'
 where plan = 'free'
   and created_at < date '2026-09-20';


-- ---------- 2. The limits, written down once --------------------------------
-- null means "no limit". Changing a number here changes it everywhere — the
-- app reads the same figures from src/lib/plans.js, so keep the two in step.

create or replace function plan_limit(p_plan text, p_kind text)
returns int
language sql
immutable
as $fn$
  select (case
    when p_plan = 'free' and p_kind = 'members'    then 25
    when p_plan = 'free' and p_kind = 'categories' then 1
    when p_plan = 'plus' and p_kind = 'members'    then 100
    else null
  end)::int;
$fn$;


-- ---------- 3. The gate -----------------------------------------------------

create or replace function enforce_plan_limit()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_kind   text;
  v_plan   text;
  v_limit  int;
  v_count  int;
  v_noun   text;
  v_exists boolean;
begin
  -- 'members' or 'categories', from the create trigger statement below.
  v_kind := tg_argv[0];

  -- There is deliberately no way past this check — not even for our own
  -- functions. The sample-data seeder (section 5) fits itself to the plan
  -- instead of being handed an exemption.
  --
  -- Reordering rows is sent as one upsert for the whole list, and an upsert
  -- runs BEFORE INSERT triggers even on rows that turn out to be updates.
  -- Without this check, a workspace sitting exactly on its limit could no
  -- longer drag its own rows into a different order.
  if v_kind = 'members' then
    select exists (select 1 from members where id = new.id) into v_exists;
  else
    select exists (select 1 from departments where id = new.id) into v_exists;
  end if;
  if v_exists then
    return new;
  end if;

  select plan into v_plan from workspaces where id = new.workspace_id;
  v_limit := plan_limit(coalesce(v_plan, 'free'), v_kind);
  if v_limit is null then
    return new;
  end if;

  if v_kind = 'members' then
    select count(*) into v_count from members where workspace_id = new.workspace_id;
    v_noun := case when v_limit = 1 then 'person' else 'people' end;
  else
    select count(*) into v_count from departments where workspace_id = new.workspace_id;
    v_noun := case when v_limit = 1 then 'category' else 'categories' end;
  end if;

  if v_count >= v_limit then
    -- The app shows this text straight to the user, so it is written for them
    -- rather than for a log file. The hint is the machine-readable part.
    raise exception 'The % plan is limited to % %. Upgrade to add more.',
      initcap(v_plan), v_limit, v_noun
      using errcode = 'P0001', hint = 'plan_limit';
  end if;

  return new;
end;
$fn$;

drop trigger if exists members_plan_limit on members;
create trigger members_plan_limit
  before insert on members
  for each row execute function enforce_plan_limit('members');

drop trigger if exists departments_plan_limit on departments;
create trigger departments_plan_limit
  before insert on departments
  for each row execute function enforce_plan_limit('categories');


-- ---------- 4. Nobody upgrades themselves for free --------------------------
-- An owner is allowed to update their own workspace row (that's how renaming
-- works), and 'plan' is a column on that row — so without this, changing your
-- own plan to 'unlimited' would be one line of JavaScript in the console.
--
-- auth.uid() is null when there's no signed-in user behind the statement,
-- which is the case in the Supabase SQL editor and for the service role. That
-- is deliberate: it's how you change someone's plan by hand until real
-- checkout exists.

create or replace function guard_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
begin
  if new.plan is distinct from old.plan and auth.uid() is not null then
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


-- ---------- 5. Make the sample data fit the plan ----------------------------
-- The demo set was written with two categories, which a Free workspace can't
-- have. Rather than give the seeder a key to walk past its own product's
-- limits, it now builds the largest sample the workspace has room for: two
-- categories where there's space for two, one where there isn't, and it will
-- hang the sample skills off an existing category rather than fail.
--
-- The sort orders start after whatever is already there, so seeding a
-- workspace that isn't completely empty doesn't collide with its rows.

create or replace function seed_sample_data(p_workspace_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_ws_id      uuid;
  v_plan       text;
  v_cat_limit  int;
  v_cat_count  int;
  v_room       int;
  v_dept_sort  int;
  v_skill_sort int;
  v_mem_sort   int;
  v_dept_eng   uuid;
  v_dept_sales uuid;
  v_skill_js   uuid;
  v_skill_sql  uuid;
  v_skill_comm uuid;
  v_member_a   uuid;
  v_member_b   uuid;
begin
  v_ws_id := coalesce(
    p_workspace_id,
    (select workspace_id from public.workspace_members
      where user_id = auth.uid() order by created_at limit 1)
  );

  if v_ws_id is null or not is_workspace_member(v_ws_id) then
    raise exception 'not_a_member: no workspace available for this user';
  end if;

  select plan into v_plan from public.workspaces where id = v_ws_id;
  select count(*) into v_cat_count from public.departments where workspace_id = v_ws_id;
  v_cat_limit := plan_limit(coalesce(v_plan, 'free'), 'categories');
  v_room := case when v_cat_limit is null then 2
                 else greatest(0, v_cat_limit - v_cat_count) end;

  select coalesce(max(sort_order), -1) + 1 into v_dept_sort
    from public.departments where workspace_id = v_ws_id;
  select coalesce(max(sort_order), -1) + 1 into v_skill_sort
    from public.skills where workspace_id = v_ws_id;
  select coalesce(max(sort_order), -1) + 1 into v_mem_sort
    from public.members where workspace_id = v_ws_id;

  if v_room >= 1 then
    insert into public.departments (workspace_id, name, sort_order, is_sample)
    values (v_ws_id, 'Engineering', v_dept_sort, true) returning id into v_dept_eng;
  else
    -- No room for another category, so borrow the one that's already here.
    -- (v_room can only be 0 when at least one category exists.)
    select id into v_dept_eng from public.departments
      where workspace_id = v_ws_id order by sort_order limit 1;
  end if;

  if v_room >= 2 then
    insert into public.departments (workspace_id, name, sort_order, is_sample)
    values (v_ws_id, 'Sales', v_dept_sort + 1, true) returning id into v_dept_sales;
  else
    v_dept_sales := v_dept_eng;
  end if;

  insert into public.skills (workspace_id, department_id, name, sort_order, is_sample)
  values (v_ws_id, v_dept_eng, 'JavaScript', v_skill_sort, true) returning id into v_skill_js;
  insert into public.skills (workspace_id, department_id, name, sort_order, is_sample)
  values (v_ws_id, v_dept_eng, 'SQL', v_skill_sort + 1, true) returning id into v_skill_sql;
  insert into public.skills (workspace_id, department_id, name, sort_order, is_sample)
  values (v_ws_id, v_dept_sales, 'Communication', v_skill_sort + 2, true) returning id into v_skill_comm;

  -- If the workspace is close enough to its people limit that these two don't
  -- fit, the limit trigger says so in plain words and nothing is written.
  insert into public.members (workspace_id, name, role, sort_order, is_sample)
  values (v_ws_id, 'Alex Rivera', 'Software Engineer', v_mem_sort, true) returning id into v_member_a;
  insert into public.members (workspace_id, name, role, sort_order, is_sample)
  values (v_ws_id, 'Jordan Lee', 'Account Executive', v_mem_sort + 1, true) returning id into v_member_b;

  insert into public.ratings (workspace_id, member_id, skill_id, current_level, target_level)
  values
    (v_ws_id, v_member_a, v_skill_js, 3, 4),
    (v_ws_id, v_member_a, v_skill_sql, 2, 3),
    (v_ws_id, v_member_b, v_skill_comm, 4, 4);
end;
$fn$;

revoke all on function seed_sample_data(uuid) from public;
grant execute on function seed_sample_data(uuid) to authenticated;


-- ---------- 6. Send the plan to the app -------------------------------------
-- Same bundle function as 007, with the plan added to each workspace so the
-- app knows which limits to show before someone runs into one.

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

    'workspaces', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', w.id,
                 'name', w.name,
                 'owner_id', w.owner_id,
                 'created_at', w.created_at,
                 'plan', w.plan,
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
$fn$;

revoke all on function get_workspace_bundle(uuid) from public;
grant execute on function get_workspace_bundle(uuid) to authenticated;

-- ---------- 7. Did it work? -------------------------------------------------
-- Every number below should match the "expected" comment. If one doesn't,
-- send me the row and I'll tell you what's missing.

select
  (select count(*) from pg_trigger
     where tgname in ('members_plan_limit', 'departments_plan_limit',
                      'workspaces_guard_plan'))                as triggers_installed, -- expected 3
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'workspaces'
       and column_name = 'plan')                               as plan_column,        -- expected 1
  (select count(*) from workspaces where plan = 'free')        as free_workspaces,    -- expected 0
  plan_limit('free', 'members')                                as free_people,        -- expected 25
  plan_limit('free', 'categories')                             as free_categories,    -- expected 1
  plan_limit('plus', 'members')                                as plus_people,        -- expected 100
  coalesce(plan_limit('unlimited', 'members')::text, 'no limit') as unlimited_people;  -- expected "no limit"

-- ============================================================================
-- DONE.
--
-- TO CHANGE SOMEONE'S PLAN BY HAND (until checkout exists), run this in the
-- SQL editor, with their workspace name in place of the example:
--
--   update workspaces set plan = 'plus' where name = 'My Workspace';
--
-- Valid values: 'free', 'plus', 'unlimited'.
--
-- TO TRY THE LIMITS ON YOUR OWN WORKSPACE, put it on Free for a minute:
--
--   update workspaces set plan = 'free' where name = 'My Workspace';
--
-- ...then set it back to 'unlimited' when you're done looking.
-- ============================================================================

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
-- New query -> paste the whole file -> Run. Expect "Success. No rows returned."
-- ============================================================================


-- ---------- 1. The plan itself ----------------------------------------------

alter table workspaces add column if not exists plan text not null default 'free';

alter table workspaces drop constraint if exists workspaces_plan_check;
alter table workspaces add constraint workspaces_plan_check
  check (plan in ('free', 'plus', 'unlimited'));

-- Grandfather everyone who is already here.
update workspaces set plan = 'unlimited' where plan = 'free';


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
  v_kind   text := tg_argv[0];
  v_plan   text;
  v_limit  int;
  v_count  int;
  v_noun   text;
  v_exists boolean;
begin
  -- The sample-data seeder is allowed past (see section 5). Nothing a browser
  -- can send sets this — PostgREST gives clients no way to set a GUC.
  if coalesce(current_setting('app.bypass_plan_limits', true), '') = 'on' then
    return new;
  end if;

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


-- ---------- 5. Let the sample data through ----------------------------------
-- The demo set includes two categories, which a Free workspace couldn't
-- otherwise create. Setting the flag on the function means it applies for the
-- length of that call and nothing else.

alter function seed_sample_data(uuid) set app.bypass_plan_limits = 'on';


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

-- ============================================================================
-- DONE.
--
-- TO CHANGE SOMEONE'S PLAN BY HAND (until checkout exists), run this in the
-- SQL editor, with their workspace name in place of the example:
--
--   update workspaces set plan = 'plus' where name = 'My Workspace';
--
-- Valid values: 'free', 'plus', 'unlimited'.
-- ============================================================================

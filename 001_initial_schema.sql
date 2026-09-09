-- ============================================================================
-- Skill Matrix — Initial database schema + Row-Level Security
--
-- WHAT THIS DOES, IN PLAIN TERMS:
--   1. Creates 5 tables: workspaces, departments, skills, members, ratings.
--   2. Turns on Row-Level Security (RLS) on all of them, so a signed-in user
--      can only ever see/edit rows that belong to their own workspace — this
--      is enforced by the database itself, not just by app code.
--   3. Adds a trigger so that the moment someone signs up, Postgres
--      automatically creates one "My Workspace" row owned by them. No app
--      code has to remember to do this — it can't be skipped or forgotten.
--
-- HOW TO RUN IT: Supabase dashboard -> your project -> SQL Editor -> New
-- query -> paste this whole file -> Run. Should say "Success. No rows
-- returned." Then check Table Editor — you should see 5 new tables.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------- 1. WORKSPACES ----------
-- One per user today (auto-created below). owner_id ties it to a Supabase
-- auth user. The shape already allows a user to own more than one workspace
-- later, but nothing in this MVP creates a second one yet.

create table workspaces (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null references auth.users(id) on delete cascade,
  name       text not null default 'My Workspace',
  created_at timestamptz not null default now()
);

-- ---------- 2. DEPARTMENTS ----------

create table departments (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,
  sort_order   int  not null default 0,
  is_sample    boolean not null default false
);

-- ---------- 3. SKILLS (grouped under a department) ----------

create table skills (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  department_id uuid not null references departments(id) on delete cascade,
  name          text not null,
  sort_order    int  not null default 0,
  is_sample     boolean not null default false
);

-- ---------- 4. MEMBERS (the people being rated — not department-scoped) ----------

create table members (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  name         text not null,
  role         text,
  sort_order   int  not null default 0,
  is_sample    boolean not null default false
);

-- ---------- 5. RATINGS (one row per member x skill — the matrix cells) ----------
-- 0 = none, 1 = learning, 2 = proficient, 3 = advanced, 4 = expert.
-- current_level is where they are today; target_level is the goal (optional).

create table ratings (
  id            uuid primary key default gen_random_uuid(),
  workspace_id  uuid not null references workspaces(id) on delete cascade,
  member_id     uuid not null references members(id) on delete cascade,
  skill_id      uuid not null references skills(id) on delete cascade,
  current_level int  check (current_level between 1 and 4),
  target_level  int  check (target_level between 1 and 4),
  updated_at    timestamptz not null default now(),
  unique (member_id, skill_id)
);

-- ============================================================================
-- ROW-LEVEL SECURITY
-- Every check below reduces to: "does this row's workspace belong to me?"
-- ============================================================================

alter table workspaces  enable row level security;
alter table departments enable row level security;
alter table skills      enable row level security;
alter table members     enable row level security;
alter table ratings     enable row level security;

-- workspaces: you can see/update only the workspace(s) you own.
-- No insert policy on purpose — the only way a workspace gets created is the
-- signup trigger below, so a user can never spoof owner_id or create extras
-- through the app just by calling insert directly.
create policy workspace_owner_select on workspaces for select
  using (owner_id = auth.uid());
create policy workspace_owner_update on workspaces for update
  using (owner_id = auth.uid());

-- departments / skills / members / ratings: isolated by workspace ownership.
create policy dept_all on departments for all
  using (workspace_id in (select id from workspaces where owner_id = auth.uid()))
  with check (workspace_id in (select id from workspaces where owner_id = auth.uid()));

create policy skill_all on skills for all
  using (workspace_id in (select id from workspaces where owner_id = auth.uid()))
  with check (workspace_id in (select id from workspaces where owner_id = auth.uid()));

create policy member_all on members for all
  using (workspace_id in (select id from workspaces where owner_id = auth.uid()))
  with check (workspace_id in (select id from workspaces where owner_id = auth.uid()));

create policy rating_all on ratings for all
  using (workspace_id in (select id from workspaces where owner_id = auth.uid()))
  with check (workspace_id in (select id from workspaces where owner_id = auth.uid()));

-- ============================================================================
-- AUTO-CREATE A WORKSPACE ON SIGNUP
-- Standard Supabase pattern: a trigger on Supabase's own auth.users table
-- fires right after a new user is created, inserting their workspace row in
-- the same breath. security definer means it runs with elevated privilege
-- (bypassing RLS) specifically so it's allowed to do that one insert.
-- ============================================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspaces (owner_id, name)
  values (new.id, 'My Workspace');
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================================
-- SAMPLE DATA TOGGLE
-- seed_sample_data() fills in a small demo set for the caller's own
-- workspace, tagged is_sample so clear_sample_data() can cleanly remove it
-- (and only it — nothing the user typed themselves).
-- ============================================================================

create or replace function seed_sample_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws_id      uuid;
  v_dept_eng   uuid;
  v_dept_sales uuid;
  v_skill_js   uuid;
  v_skill_sql  uuid;
  v_skill_comm uuid;
  v_member_a   uuid;
  v_member_b   uuid;
begin
  select id into v_ws_id from public.workspaces where owner_id = auth.uid() limit 1;
  if v_ws_id is null then
    raise exception 'not_provisioned: no workspace for this user';
  end if;

  insert into public.departments (workspace_id, name, sort_order, is_sample)
  values (v_ws_id, 'Engineering', 0, true) returning id into v_dept_eng;
  insert into public.departments (workspace_id, name, sort_order, is_sample)
  values (v_ws_id, 'Sales', 1, true) returning id into v_dept_sales;

  insert into public.skills (workspace_id, department_id, name, sort_order, is_sample)
  values (v_ws_id, v_dept_eng, 'JavaScript', 0, true) returning id into v_skill_js;
  insert into public.skills (workspace_id, department_id, name, sort_order, is_sample)
  values (v_ws_id, v_dept_eng, 'SQL', 1, true) returning id into v_skill_sql;
  insert into public.skills (workspace_id, department_id, name, sort_order, is_sample)
  values (v_ws_id, v_dept_sales, 'Communication', 0, true) returning id into v_skill_comm;

  insert into public.members (workspace_id, name, role, sort_order, is_sample)
  values (v_ws_id, 'Alex Rivera', 'Software Engineer', 0, true) returning id into v_member_a;
  insert into public.members (workspace_id, name, role, sort_order, is_sample)
  values (v_ws_id, 'Jordan Lee', 'Account Executive', 1, true) returning id into v_member_b;

  insert into public.ratings (workspace_id, member_id, skill_id, current_level, target_level)
  values
    (v_ws_id, v_member_a, v_skill_js, 3, 4),
    (v_ws_id, v_member_a, v_skill_sql, 2, 3),
    (v_ws_id, v_member_b, v_skill_comm, 4, 4);
end;
$$;

revoke all on function seed_sample_data() from public;
grant execute on function seed_sample_data() to authenticated;

create or replace function clear_sample_data()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws_id uuid;
begin
  select id into v_ws_id from public.workspaces where owner_id = auth.uid() limit 1;
  if v_ws_id is null then
    return;
  end if;

  delete from public.members where workspace_id = v_ws_id and is_sample = true;
  delete from public.skills where workspace_id = v_ws_id and is_sample = true;
  delete from public.departments where workspace_id = v_ws_id and is_sample = true;
end;
$$;

revoke all on function clear_sample_data() from public;
grant execute on function clear_sample_data() to authenticated;

-- ============================================================================
-- DONE.
-- ============================================================================

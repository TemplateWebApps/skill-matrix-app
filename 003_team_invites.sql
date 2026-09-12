-- ============================================================================
-- Skill Matrix — Team invites & shared workspaces
--
-- WHAT THIS DOES, IN PLAIN TERMS:
--   Right now a workspace is reachable by exactly one person: whoever's id is
--   in workspaces.owner_id. That makes invites impossible. This migration
--   introduces a membership list (workspace_members) so several people can
--   share one workspace, and rewrites every security rule from "do you own
--   this workspace?" to "are you a member of it?".
--
--   Nothing is deleted. Every existing workspace owner is added to the new
--   membership list as 'owner', so your current data keeps working exactly
--   as before.
--
-- HOW TO RUN IT: Supabase dashboard -> skill-matrix-beta -> SQL Editor ->
-- New query -> paste this whole file -> Run. Should say "Success. No rows
-- returned."
-- ============================================================================

-- ---------- 1. MEMBERSHIP ----------

create table workspace_members (
  workspace_id uuid not null references workspaces(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  role         text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at   timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

-- Everyone who already owns a workspace becomes its 'owner' member.
insert into workspace_members (workspace_id, user_id, role)
select id, owner_id, 'owner' from workspaces
on conflict do nothing;

-- ---------- 2. INVITES ----------

create table invites (
  id           uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references workspaces(id) on delete cascade,
  token        text not null unique default encode(gen_random_bytes(16), 'hex'),
  role         text not null default 'member' check (role in ('admin', 'member')),
  created_by   uuid not null references auth.users(id),
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default (now() + interval '7 days'),
  accepted_at  timestamptz,
  accepted_by  uuid references auth.users(id)
);

-- ---------- 3. HELPERS ----------
-- These are security definer on purpose. A policy on workspace_members that
-- queried workspace_members directly would recurse forever (checking the
-- table's own policy to read the table). Running the lookup inside a security
-- definer function sidesteps RLS for that one lookup and breaks the loop.

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.workspace_members
    where workspace_id = p_workspace_id and user_id = auth.uid()
  );
$$;

create or replace function public.workspace_role(p_workspace_id uuid)
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.workspace_members
  where workspace_id = p_workspace_id and user_id = auth.uid();
$$;

grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.workspace_role(uuid) to authenticated;

-- ---------- 4. REWRITE THE SECURITY RULES ----------
-- Out with "do you own it", in with "are you a member of it".

drop policy if exists workspace_owner_select on workspaces;
drop policy if exists workspace_owner_update on workspaces;
drop policy if exists dept_all on departments;
drop policy if exists skill_all on skills;
drop policy if exists member_all on members;
drop policy if exists rating_all on ratings;

create policy workspace_member_select on workspaces for select
  using (is_workspace_member(id));
-- Renaming a workspace stays an owner/admin action.
create policy workspace_admin_update on workspaces for update
  using (workspace_role(id) in ('owner', 'admin'));

create policy dept_all on departments for all
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy skill_all on skills for all
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy member_all on members for all
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

create policy rating_all on ratings for all
  using (is_workspace_member(workspace_id))
  with check (is_workspace_member(workspace_id));

-- workspace_members: everyone in a workspace can see who else is in it;
-- only owners/admins can change the list. (Joining happens through
-- accept_invite() below, which is security definer and bypasses this.)
alter table workspace_members enable row level security;

create policy members_select on workspace_members for select
  using (is_workspace_member(workspace_id));
create policy members_admin_write on workspace_members for all
  using (workspace_role(workspace_id) in ('owner', 'admin'))
  with check (workspace_role(workspace_id) in ('owner', 'admin'));

-- invites: only owners/admins of that workspace can create, see or revoke.
-- An invitee never needs to read this table — accept_invite() looks the token
-- up on their behalf.
alter table invites enable row level security;

create policy invites_admin_all on invites for all
  using (workspace_role(workspace_id) in ('owner', 'admin'))
  with check (workspace_role(workspace_id) in ('owner', 'admin'));

-- ---------- 5. SIGNUP TRIGGER NOW ALSO RECORDS MEMBERSHIP ----------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
begin
  insert into public.workspaces (owner_id, name)
  values (new.id, 'My Workspace')
  returning id into v_workspace_id;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_workspace_id, new.id, 'owner');

  return new;
end;
$$;

-- ---------- 6. INVITE FLOW ----------

create or replace function create_invite(p_workspace_id uuid, p_role text default 'member')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_token text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  if workspace_role(p_workspace_id) not in ('owner', 'admin') then
    raise exception 'not_allowed: only an owner or admin can invite people';
  end if;

  if p_role not in ('admin', 'member') then
    raise exception 'invalid_role';
  end if;

  insert into public.invites (workspace_id, role, created_by)
  values (p_workspace_id, p_role, auth.uid())
  returning token into v_token;

  return v_token;
end;
$$;

-- Idempotent on purpose: clicking a link twice, or reloading the page after
-- joining, returns the workspace instead of raising a confusing error.
create or replace function accept_invite(p_token text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invites%rowtype;
begin
  if auth.uid() is null then
    raise exception 'not_authenticated: log in or sign up first, then open the invite link again';
  end if;

  select * into v_invite from public.invites where token = p_token;

  if v_invite.id is null then
    raise exception 'invalid_invite: this invite link is not valid';
  end if;

  -- Already in it (possibly from this very invite) — nothing to do.
  if exists (
    select 1 from public.workspace_members
    where workspace_id = v_invite.workspace_id and user_id = auth.uid()
  ) then
    return v_invite.workspace_id;
  end if;

  if v_invite.expires_at <= now() then
    raise exception 'expired_invite: this invite link has expired — ask for a new one';
  end if;

  if v_invite.accepted_at is not null then
    raise exception 'used_invite: this invite link has already been used';
  end if;

  insert into public.workspace_members (workspace_id, user_id, role)
  values (v_invite.workspace_id, auth.uid(), v_invite.role);

  update public.invites
     set accepted_at = now(), accepted_by = auth.uid()
   where id = v_invite.id;

  return v_invite.workspace_id;
end;
$$;

-- Lets the invite page show "Join Acme Inc" before the invitee has an account,
-- without granting anonymous read access to the invites table generally.
create or replace function get_invite_preview(p_token text)
returns table (workspace_name text, is_valid boolean)
language sql
security definer
stable
set search_path = public
as $$
  select w.name,
         (i.accepted_at is null and i.expires_at > now())
  from public.invites i
  join public.workspaces w on w.id = i.workspace_id
  where i.token = p_token
  limit 1;
$$;

-- Who's in this workspace. Needed because auth.users isn't readable from the
-- browser, so emails have to be handed out deliberately — and only to people
-- who are already in the same workspace.
create or replace function list_workspace_members(p_workspace_id uuid)
returns table (user_id uuid, email text, role text, joined_at timestamptz)
language sql
security definer
stable
set search_path = public
as $$
  select wm.user_id, u.email::text, wm.role, wm.created_at
  from public.workspace_members wm
  join auth.users u on u.id = wm.user_id
  where wm.workspace_id = p_workspace_id
    and is_workspace_member(p_workspace_id)
  order by wm.created_at;
$$;

revoke all on function create_invite(uuid, text) from public;
revoke all on function accept_invite(text) from public;
revoke all on function get_invite_preview(text) from public;
revoke all on function list_workspace_members(uuid) from public;

grant execute on function create_invite(uuid, text) to authenticated;
grant execute on function accept_invite(text) to authenticated;
grant execute on function get_invite_preview(text) to anon, authenticated;
grant execute on function list_workspace_members(uuid) to authenticated;

-- ---------- 7. SAMPLE DATA FUNCTIONS FOLLOW MEMBERSHIP TOO ----------
-- Dropped and recreated because they now take an optional workspace argument
-- (a person can be in more than one workspace once invites exist).

drop function if exists seed_sample_data();
drop function if exists clear_sample_data();

create or replace function seed_sample_data(p_workspace_id uuid default null)
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
  v_ws_id := coalesce(
    p_workspace_id,
    (select workspace_id from public.workspace_members
      where user_id = auth.uid() order by created_at limit 1)
  );

  if v_ws_id is null or not is_workspace_member(v_ws_id) then
    raise exception 'not_a_member: no workspace available for this user';
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

create or replace function clear_sample_data(p_workspace_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ws_id uuid;
begin
  v_ws_id := coalesce(
    p_workspace_id,
    (select workspace_id from public.workspace_members
      where user_id = auth.uid() order by created_at limit 1)
  );

  if v_ws_id is null or not is_workspace_member(v_ws_id) then
    return;
  end if;

  delete from public.members where workspace_id = v_ws_id and is_sample = true;
  delete from public.skills where workspace_id = v_ws_id and is_sample = true;
  delete from public.departments where workspace_id = v_ws_id and is_sample = true;
end;
$$;

revoke all on function seed_sample_data(uuid) from public;
revoke all on function clear_sample_data(uuid) from public;
grant execute on function seed_sample_data(uuid) to authenticated;
grant execute on function clear_sample_data(uuid) to authenticated;

-- ============================================================================
-- DONE. Table Editor should now show two new tables: workspace_members
-- (with one 'owner' row per existing workspace) and invites (empty).
-- ============================================================================

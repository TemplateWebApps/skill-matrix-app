-- ============================================================================
-- Skill Matrix — Record every plan change (014)
--
-- WHAT THIS ADDS
-- A log of plan changes: which workspace, from what to what, when, and who did
-- it. The admin screen gains a "Plan since" column reading from it.
--
-- WHY A LOG AND NOT JUST A DATE COLUMN
-- "Upgraded on the 4th" is one fact. "Upgraded on the 4th, went back to Free
-- on the 11th, upgraded again on the 20th" is a customer telling you something.
-- A single timestamp throws the second one away, and the log costs one small
-- table.
--
-- WHAT IT CANNOT TELL YOU
-- Anything that happened before you run this. Plan changes weren't recorded,
-- so there's nothing to backfill from — the column reads "—" for workspaces
-- that haven't changed plan since today. Not a bug, just the start of the
-- record.
--
-- HOW TO RUN IT: Supabase dashboard -> skill-matrix-beta -> SQL Editor.
-- Direct link: https://supabase.com/dashboard/project/mhubibyupkcdnlvzeaau/sql/new
-- Run 013 first. Safe to run more than once.
-- ============================================================================


-- ---------- 1. The log ------------------------------------------------------

create table if not exists plan_history (
  id           bigint generated always as identity primary key,
  workspace_id uuid not null references workspaces(id) on delete cascade,
  from_plan    text,
  to_plan      text not null,
  changed_at   timestamptz not null default now(),
  changed_by   text                      -- email, or 'sql editor' when there's
);                                        -- no signed-in user behind the change

create index if not exists plan_history_workspace_idx
  on plan_history (workspace_id, changed_at desc);

alter table plan_history enable row level security;
-- No policies, deliberately: this is read through admin_list_accounts (which
-- checks admin status) and written by the trigger below, both of which are
-- security definer. Nothing else needs to see it.


-- ---------- 2. Write to it whenever a plan changes --------------------------
-- Folded into the existing guard rather than added as a second trigger, so
-- there is exactly one place that decides what happens on a plan change.

create or replace function guard_plan_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $fn$
declare
  v_actor text;
begin
  if new.plan is distinct from old.plan then
    if auth.uid() is not null and not is_app_admin() then
      raise exception 'A workspace plan can only be changed by billing.'
        using errcode = 'P0001', hint = 'plan_change_not_allowed';
    end if;

    select coalesce((select email from auth.users where id = auth.uid()), 'sql editor')
      into v_actor;

    insert into plan_history (workspace_id, from_plan, to_plan, changed_by)
    values (new.id, old.plan, new.plan, v_actor);
  end if;

  return new;
end;
$fn$;

drop trigger if exists workspaces_guard_plan on workspaces;
create trigger workspaces_guard_plan
  before update on workspaces
  for each row execute function guard_plan_change();


-- ---------- 3. Show it on the admin screen ----------------------------------
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
  plan_since     timestamptz,
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
    -- When the plan they're on now began. Null means it hasn't changed since
    -- logging started.
    (select ph.changed_at from plan_history ph
      where ph.workspace_id = w.id and ph.to_plan = w.plan
      order by ph.changed_at desc limit 1),
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


-- ---------- 4. Did it work? -------------------------------------------------

select
  (select count(*) from information_schema.tables
    where table_schema = 'public' and table_name = 'plan_history')   as history_table,  -- 1
  (select count(*) from pg_policies where tablename = 'plan_history') as history_policies, -- 0 is correct
  (select count(*) from plan_history)                                 as changes_logged, -- 0 at first
  (select count(*) from pg_proc where proname = 'admin_list_accounts') as fn_list;       -- 1

-- ============================================================================
-- DONE.
--
-- TO SEE THE FULL HISTORY FOR EVERYONE (the admin screen shows only the
-- current plan's start date):
--
--   select w.name, h.from_plan, h.to_plan, h.changed_at, h.changed_by
--     from plan_history h
--     join workspaces w on w.id = h.workspace_id
--    order by h.changed_at desc;
--
-- Changes made from this SQL editor are logged as 'sql editor'; changes made
-- from the admin screen are logged under that admin's email.
-- ============================================================================

-- ============================================================================
-- Skill Matrix — Make the real tiers real, so you can test them (012)
--
-- RUN THIS ONE FILE. It replaces 010 and 011, which were written but never
-- run — they've been deleted so there's no chance of running the wrong one.
--
-- WHAT YOU GET AFTER THIS
--
--   Free        25 people, 25 skills, no insights dashboard
--   Unlimited   $9.99 a month, everything
--
-- And new signups land on FREE, so signing up from the landing page gives you
-- the genuine free experience — caps, walls, locked dashboard and all.
--
-- 009 put every existing workspace on 'unlimited'. That still holds: your own
-- workspaces keep everything. This only changes what NEW accounts get.
--
-- The snippets at the bottom move any account between plans in one click, so
-- you can walk a test account up to the wall, upgrade it, and watch what
-- happens — and they're how you'd comp a real beta tester who hits the cap.
--
-- HOW TO RUN IT: Supabase dashboard -> skill-matrix-beta -> SQL Editor ->
-- New query -> paste -> Run. It prints a row of checks at the end.
-- Safe to run more than once.
-- ============================================================================


-- ---------- 1. The limits ---------------------------------------------------

create or replace function plan_limit(p_plan text, p_kind text)
returns int
language sql
immutable
as $fn$
  select (case
    when p_plan = 'free' and p_kind = 'members' then 25
    when p_plan = 'free' and p_kind = 'skills'  then 25
    else null                                   -- everything else: no limit
  end)::int;
$fn$;


-- ---------- 2. The gate, now covering skills --------------------------------
-- The existing-row check earns its keep here: reordering sends the whole list
-- as one upsert, and every column drag does it. Without it, a workspace on
-- exactly 25 skills could no longer drag its own columns around.

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
  v_kind := tg_argv[0];   -- 'members' or 'skills'

  if v_kind = 'members' then
    select exists (select 1 from members where id = new.id) into v_exists;
  else
    select exists (select 1 from skills where id = new.id) into v_exists;
  end if;
  if v_exists then
    return new;           -- a reorder, not an addition
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
    select count(*) into v_count from skills where workspace_id = new.workspace_id;
    v_noun := case when v_limit = 1 then 'skill' else 'skills' end;
  end if;

  if v_count >= v_limit then
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

drop trigger if exists skills_plan_limit on skills;
create trigger skills_plan_limit
  before insert on skills
  for each row execute function enforce_plan_limit('skills');

-- Categories aren't limited on any plan.
drop trigger if exists departments_plan_limit on departments;


-- ---------- 3. New signups start on Free ------------------------------------
-- This is what lets you sign up from the landing page and actually see the
-- free experience. Existing workspaces are untouched.

alter table workspaces alter column plan set default 'free';


-- ---------- 4. Did it work? -------------------------------------------------

select
  plan_limit('free', 'members')      as free_people,      -- expected 25
  plan_limit('free', 'skills')       as free_skills,      -- expected 25
  plan_limit('unlimited', 'members') as paid_people,      -- expected blank
  (select column_default from information_schema.columns
     where table_schema = 'public' and table_name = 'workspaces'
       and column_name = 'plan')                              as new_signups,     -- 'free'::text
  (select count(*) from pg_trigger where tgname = 'members_plan_limit')     as people_trigger,   -- 1
  (select count(*) from pg_trigger where tgname = 'skills_plan_limit')      as skills_trigger,   -- 1
  (select count(*) from pg_trigger where tgname = 'departments_plan_limit') as category_trigger; -- 0


-- ============================================================================
-- YOUR TESTING CONTROLS — keep this file open while you test.
-- Change the email, select the one statement, and run it.
--
-- UPGRADE an account to the paid plan (this is also how you'd comp a beta
-- tester who hits the cap — no data moves, they just stop hitting walls):
--
--   update workspaces set plan = 'unlimited'
--    where id in (select wm.workspace_id from workspace_members wm
--                   join auth.users u on u.id = wm.user_id
--                  where u.email = 'you+test1@example.com');
--
-- DOWNGRADE it back to Free, to test the same account from the other side:
--
--   update workspaces set plan = 'free'
--    where id in (select wm.workspace_id from workspace_members wm
--                   join auth.users u on u.id = wm.user_id
--                  where u.email = 'you+test1@example.com');
--
-- SEE WHO IS ON WHAT:
--
--   select u.email, w.name, w.plan,
--          (select count(*) from members m where m.workspace_id = w.id) as people,
--          (select count(*) from skills  s where s.workspace_id = w.id) as skills
--     from workspace_members wm
--     join auth.users u on u.id = wm.user_id
--     join workspaces w on w.id = wm.workspace_id
--    order by u.email;
--
-- DELETE a test account completely, so you can reuse the address:
--
--   delete from auth.users where email = 'you+test1@example.com';
--   -- their workspace and all its data go with them, by design.
--
-- After changing a plan, RELOAD THE APP — it reads the plan when the page
-- loads, so an open tab keeps showing the old one.
-- ============================================================================

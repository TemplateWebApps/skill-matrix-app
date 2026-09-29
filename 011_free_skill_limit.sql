-- ============================================================================
-- Skill Matrix — Free is also capped at 25 skills (011)
--
--   Free        25 people, 25 skills, no dashboard
--   Unlimited   $9.99 a month, everything
--
-- The skill cap is enforced here, the same way the people cap is. The
-- dashboard is not, and can't usefully be: it's calculated in the browser out
-- of matrix rows the workspace already has every right to read, so there is no
-- request for the database to refuse. That one lives in the app alone.
--
-- HOW TO RUN IT: Supabase dashboard -> skill-matrix-beta -> SQL Editor ->
-- New query -> paste -> Run. It prints a row of checks at the end.
-- Safe to run more than once. Run 010 first if you haven't.
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


-- ---------- 2. Teach the gate about skills ----------------------------------
-- Same function as 008, with a third kind. The existing-row check matters more
-- here than anywhere else: reordering skills sends the whole list as one
-- upsert, and every column drag does it. Without that check, a workspace
-- sitting on exactly 25 skills could no longer drag its own columns around.

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
  -- 'members' or 'skills', from the create trigger statements below.
  v_kind := tg_argv[0];

  -- An upsert runs BEFORE INSERT triggers even on rows that turn out to be
  -- updates, so a row that already exists is a reorder, not an addition.
  if v_kind = 'members' then
    select exists (select 1 from members where id = new.id) into v_exists;
  else
    select exists (select 1 from skills where id = new.id) into v_exists;
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
    select count(*) into v_count from skills where workspace_id = new.workspace_id;
    v_noun := case when v_limit = 1 then 'skill' else 'skills' end;
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

drop trigger if exists skills_plan_limit on skills;
create trigger skills_plan_limit
  before insert on skills
  for each row execute function enforce_plan_limit('skills');

-- Categories are not limited on any plan (see 010).
drop trigger if exists departments_plan_limit on departments;


-- ---------- 3. Did it work? -------------------------------------------------

select
  plan_limit('free', 'members')      as free_people,      -- expected 25
  plan_limit('free', 'skills')       as free_skills,      -- expected 25
  plan_limit('free', 'categories')   as free_categories,  -- expected blank
  plan_limit('unlimited', 'skills')  as paid_skills,      -- expected blank
  (select count(*) from pg_trigger where tgname = 'members_plan_limit')     as people_trigger,   -- 1
  (select count(*) from pg_trigger where tgname = 'skills_plan_limit')      as skills_trigger,   -- 1
  (select count(*) from pg_trigger where tgname = 'departments_plan_limit') as category_trigger; -- 0

-- ============================================================================
-- DONE. Nothing is enforced while the beta runs — 009 has every workspace on
-- 'unlimited'. To end the beta:
--
--   alter table workspaces alter column plan set default 'free';
-- ============================================================================

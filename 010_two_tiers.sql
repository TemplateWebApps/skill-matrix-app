-- ============================================================================
-- Skill Matrix — Two tiers instead of three (010)
--
-- WHAT CHANGES
--
--   Free        up to 25 people
--   Unlimited   $9.99 a month, unlimited people
--
-- That's the whole model now. One limit, one number. The category limit is
-- gone completely — it applied to nobody after this, so the trigger enforcing
-- it is dropped rather than left running as a no-op on every insert.
--
-- The middle 'plus' tier is retired. No workspace is on it, but the check
-- constraint still permits the value and plan_limit() treats it as unlimited,
-- so a stray row would keep everything it had rather than losing access.
--
-- NOTHING IS ENFORCED WHILE THE BETA RUNS. Migration 009 put every workspace
-- on 'unlimited', and that still holds — this changes what the tiers mean, not
-- who is on them.
--
-- HOW TO RUN IT: Supabase dashboard -> skill-matrix-beta -> SQL Editor ->
-- New query -> paste -> Run. It prints a row of checks at the end.
-- Safe to run more than once.
-- ============================================================================


-- ---------- 1. One limit, one number ----------------------------------------

create or replace function plan_limit(p_plan text, p_kind text)
returns int
language sql
immutable
as $fn$
  select (case
    when p_plan = 'free' and p_kind = 'members' then 25
    else null                                   -- everything else: no limit
  end)::int;
$fn$;


-- ---------- 2. The category limit is gone -----------------------------------
-- plan_limit now returns null for categories on every plan, so this trigger
-- could only ever wave rows through. Dropping it means one less thing running
-- on every insert, and one less thing to reason about.

drop trigger if exists departments_plan_limit on departments;


-- ---------- 3. Did it work? -------------------------------------------------
-- Expected: free_people = 25, and null (shown blank) for the other three.

select
  plan_limit('free', 'members')          as free_people,        -- expected 25
  plan_limit('free', 'categories')       as free_categories,    -- expected blank
  plan_limit('unlimited', 'members')     as unlimited_people,   -- expected blank
  plan_limit('plus', 'members')          as retired_tier,       -- expected blank
  (select count(*) from pg_trigger
     where tgname = 'departments_plan_limit')  as category_trigger, -- expected 0
  (select count(*) from pg_trigger
     where tgname = 'members_plan_limit')      as people_trigger;   -- expected 1

-- ============================================================================
-- DONE.
--
-- TO END THE BETA AND TURN THE PEOPLE LIMIT ON:
--
--   alter table workspaces alter column plan set default 'free';
--
-- New signups then start on Free and stop at 25 people; everyone already
-- testing keeps their unlimited workspace.
--
-- TO PUT ONE WORKSPACE ON THE PAID PLAN BY HAND (until checkout exists):
--
--   update workspaces set plan = 'unlimited' where name = 'Their Workspace';
-- ============================================================================

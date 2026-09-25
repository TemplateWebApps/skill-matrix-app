-- ============================================================================
-- Skill Matrix — No plan limits during the beta (009)
--
-- WHY
-- Beta testers who hit the Free wall get an upgrade dialog with no checkout
-- behind it. They can't pay, so they just stop — and a tester who stops tells
-- you nothing. For the beta the limits should be off.
--
-- WHAT THIS DOES
-- Nothing is deleted or rewritten. The gate built in 008 stays exactly where
-- it is, triggers and all; every workspace is simply handed the 'unlimited'
-- plan, which the gate already lets straight through. New signups get it too,
-- because the column default changes.
--
-- TURNING LIMITS BACK ON when checkout exists is the two statements at the
-- bottom of this file. That's the whole reversal — no migration needed.
--
-- HOW TO RUN IT: Supabase dashboard -> skill-matrix-beta -> SQL Editor ->
-- New query -> paste -> Run. It prints a row of checks at the end.
-- ============================================================================


-- New workspaces start unlimited instead of free.
alter table workspaces alter column plan set default 'unlimited';

-- And so does everything that already exists.
update workspaces set plan = 'unlimited' where plan <> 'unlimited';


-- ---------- Did it work? ----------------------------------------------------
-- Expected: beta_default = 'unlimited', limited_workspaces = 0.

select
  (select column_default from information_schema.columns
     where table_schema = 'public' and table_name = 'workspaces'
       and column_name = 'plan')                          as beta_default,
  (select count(*) from workspaces where plan <> 'unlimited') as limited_workspaces,
  (select count(*) from workspaces)                       as total_workspaces;


-- ============================================================================
-- TO END THE BETA AND TURN LIMITS ON, run these two lines. New signups land on
-- Free; everyone already testing keeps their unlimited workspace, which is
-- probably what you want for people who helped you test.
--
--   alter table workspaces alter column plan set default 'free';
--   -- then, only if you also want to move existing testers onto Free:
--   -- update workspaces set plan = 'free' where created_at >= date '2026-09-25';
--
-- Nothing else has to change. The app already reads the plan and shows the
-- right limits and upgrade prompts the moment a workspace stops being
-- unlimited.
-- ============================================================================

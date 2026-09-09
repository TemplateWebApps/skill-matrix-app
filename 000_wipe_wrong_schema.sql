-- ============================================================================
-- ONE-TIME CLEANUP for the skill-matrix-beta project.
-- Removes the TrainMatrix tables/functions that ended up in this project by
-- mistake, so 001_initial_schema.sql can create the real schema cleanly.
--
-- ONLY run this in skill-matrix-beta (mhubibyupkcdnlvzeaau). Do NOT run it
-- against the actual TrainMatrix project — this permanently deletes any data
-- in these tables.
--
-- "cascade" removes each table along with anything that depends on it
-- (foreign keys, RLS policies) — that's expected and fine here.
-- ============================================================================

drop table if exists completion_log        cascade;
drop table if exists completions           cascade;
drop table if exists member_departments    cascade;
drop table if exists training_departments  cascade;
drop table if exists trainings             cascade;
drop table if exists training_templates    cascade;
drop table if exists team_members          cascade;
drop table if exists categories            cascade;
drop table if exists departments           cascade;
drop table if exists subscriptions         cascade;
drop table if exists invites               cascade;
drop table if exists profiles              cascade;
drop table if exists organizations         cascade;

drop function if exists create_org_and_profile(text, text) cascade;
drop function if exists accept_invite(text, text)          cascade;
drop function if exists get_invite_org_name(text)           cascade;

-- ============================================================================
-- DONE. Check Table Editor -> should show no tables (or none of the above).
-- Next: run 001_initial_schema.sql in this same project.
-- ============================================================================

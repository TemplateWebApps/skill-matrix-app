-- ============================================================================
-- Adjusts ratings to match the real prototype's 5-state scale:
-- "Not Required" (blank/×), then 1 = No Experience, 2 = Beginner,
-- 3 = Capable, 4 = Expert / Can Train. Previously this allowed 0-4 with 0
-- meaning "none"; now 0 is gone and "not set" is represented by NULL instead.
-- ============================================================================

alter table ratings alter column current_level drop not null;
alter table ratings alter column current_level drop default;

alter table ratings drop constraint if exists ratings_current_level_check;
alter table ratings add constraint ratings_current_level_check
  check (current_level between 1 and 4);

alter table ratings drop constraint if exists ratings_target_level_check;
alter table ratings add constraint ratings_target_level_check
  check (target_level between 1 and 4);

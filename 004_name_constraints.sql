-- ============================================================================
-- Skill Matrix — Names must actually be names
--
-- WHY: a name could be saved as an empty string, which rendered as an
-- invisible row you couldn't identify or search for, and there was no upper
-- limit either — a 400-character name was accepted and silently clipped.
--
-- This adds a floor and a ceiling at the database level, so nothing can write
-- a blank name regardless of which screen (or script) it comes from.
--
-- Existing rows are tidied up FIRST, so the constraints can't fail to apply.
--
-- HOW TO RUN IT: Supabase dashboard -> skill-matrix-beta -> SQL Editor ->
-- New query -> paste -> Run. "Success. No rows returned."
-- ============================================================================

-- ---------- 1. Tidy anything that would violate the new rules ----------

update members    set name = 'Unnamed'    where coalesce(trim(name), '') = '';
update skills     set name = 'Untitled'   where coalesce(trim(name), '') = '';
update departments set name = 'Untitled'  where coalesce(trim(name), '') = '';
update workspaces set name = 'My Workspace' where coalesce(trim(name), '') = '';

update members     set name = left(trim(name), 80) where length(trim(name)) > 80;
update skills      set name = left(trim(name), 80) where length(trim(name)) > 80;
update departments set name = left(trim(name), 80) where length(trim(name)) > 80;
update workspaces  set name = left(trim(name), 80) where length(trim(name)) > 80;

-- role is optional, but shouldn't be a wall of text either
update members set role = left(trim(role), 80) where length(trim(role)) > 80;

-- ---------- 2. Enforce it from here on ----------

alter table members
  add constraint members_name_length check (length(trim(name)) between 1 and 80);
alter table members
  add constraint members_role_length check (role is null or length(role) <= 80);

alter table skills
  add constraint skills_name_length check (length(trim(name)) between 1 and 80);

alter table departments
  add constraint departments_name_length check (length(trim(name)) between 1 and 80);

alter table workspaces
  add constraint workspaces_name_length check (length(trim(name)) between 1 and 80);

-- ============================================================================
-- DONE.
-- ============================================================================

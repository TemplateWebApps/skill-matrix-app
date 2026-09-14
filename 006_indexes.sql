-- ============================================================================
-- Skill Matrix — Indexes for the columns everything is filtered by
--
-- WHY: every query the app runs is "give me the rows for this workspace".
-- Postgres indexes primary keys automatically, but it does NOT index foreign
-- key columns — so with no index on workspace_id, finding one workspace's rows
-- means reading the whole table.
--
-- With a few hundred rows that's instant and invisible. Once the tables hold
-- hundreds of thousands of rows across many customers, every page load would
-- scan all of them. These indexes let Postgres jump straight to the rows it
-- needs, so one customer's load time stops depending on how many other
-- customers exist.
--
-- Safe to run on a live database: creating an index doesn't change or delete
-- any data, and at your current size it takes milliseconds.
--
-- HOW TO RUN IT: Supabase dashboard -> skill-matrix-beta -> SQL Editor ->
-- New query -> paste -> Run. "Success. No rows returned."
-- ============================================================================

-- The workspace filter on every table the matrix loads.
create index if not exists idx_departments_workspace on departments (workspace_id);
create index if not exists idx_skills_workspace      on skills (workspace_id);
create index if not exists idx_members_workspace     on members (workspace_id);
create index if not exists idx_ratings_workspace     on ratings (workspace_id);

-- Skills are grouped by category, and deleting a category cascades to them.
create index if not exists idx_skills_department on skills (department_id);

-- Ratings are looked up and cascade-deleted by both sides of the grid.
create index if not exists idx_ratings_member on ratings (member_id);
create index if not exists idx_ratings_skill  on ratings (skill_id);

-- Membership is checked on literally every request, by both RLS policies and
-- is_workspace_member(). user_id is the side that isn't already covered by the
-- (workspace_id, user_id) primary key.
create index if not exists idx_workspace_members_user on workspace_members (user_id);

-- Workspaces are listed by owner, and invites are looked up by workspace.
create index if not exists idx_workspaces_owner on workspaces (owner_id);
create index if not exists idx_invites_workspace on invites (workspace_id);

-- ============================================================================
-- DONE. Nothing changes visibly today — this is purely so performance holds
-- as the tables grow.
-- ============================================================================

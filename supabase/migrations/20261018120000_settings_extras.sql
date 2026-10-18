-- S-10 (#118): synced settings that have no column of their own (hints, C-08/C-09 keys).
-- Additive and safe for old app versions: their upserts omit the column, and an upsert
-- only updates the columns it sends, so they never clear it. The app detects a missing
-- column (PGRST204) and syncs without it, so this can be applied at any time.
-- Full-timestamp version on purpose: 20261018_ is already taken (see #194).
alter table public.settings
  add column if not exists extras jsonb not null default '{}'::jsonb;

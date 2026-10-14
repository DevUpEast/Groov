-- Streak forgiveness (#20): per-day habit skips and automatic streak freezes live
-- on the settings row so they sync like every other preference.
--   skips          {"YYYY-MM-DD": ["habitId", ...]}
--   streak_freezes ["YYYY-MM-DD", ...]
alter table settings
  add column if not exists skips          jsonb not null default '{}'::jsonb,
  add column if not exists streak_freezes jsonb not null default '[]'::jsonb;

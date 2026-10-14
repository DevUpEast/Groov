-- Close the sync field gaps and add change tracking for incremental pulls.
--
-- * habits.reminder / habits.custom_icon_uri and the settings.evening_reminder_*
--   columns were never synced, so they were lost on reinstall or a second device.
-- * updated_at on every user-data table (maintained by a trigger) lets the app pull
--   only rows changed since its last pull when it returns to the foreground.

alter table habits
  add column if not exists reminder        jsonb,
  add column if not exists custom_icon_uri text;

alter table settings
  add column if not exists evening_reminder_enabled boolean not null default false,
  add column if not exists evening_reminder_hour    integer not null default 20,
  add column if not exists evening_reminder_minute  integer not null default 0;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array['habits', 'completions', 'challenges', 'past_challenges', 'settings', 'daily_snapshots']
  loop
    execute format('alter table %I add column if not exists updated_at timestamptz not null default now()', t);
    execute format('drop trigger if exists set_updated_at on %I', t);
    execute format('create trigger set_updated_at before update on %I for each row execute function public.set_updated_at()', t);
    execute format('create index if not exists %I on %I (user_id, updated_at)', t || '_user_updated_idx', t);
  end loop;
end;
$$;

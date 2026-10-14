-- Habit organisation (#26): colour, time-of-day grouping, archive, manual order,
-- unit label for volume habits, and a free-text note per completion.
alter table habits
  add column if not exists color       text,
  add column if not exists time_of_day text,
  add column if not exists archived    boolean not null default false,
  add column if not exists sort_order  integer not null default 0,
  add column if not exists unit        text;

alter table completions
  add column if not exists note text;

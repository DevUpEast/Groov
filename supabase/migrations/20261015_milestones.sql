-- Streak milestones (#24): [{ id: 'streak-7', days: 7, date: 'YYYY-MM-DD' }]
alter table settings
  add column if not exists milestones jsonb not null default '[]'::jsonb;

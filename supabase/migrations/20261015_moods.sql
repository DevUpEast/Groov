-- Daily mood check-in (#32): one optional 1-5 rating per user per day.
create table if not exists moods (
  user_id    uuid not null references auth.users(id) on delete cascade,
  date       date not null,
  mood       smallint not null check (mood between 1 and 5),
  updated_at timestamptz not null default now(),
  primary key (user_id, date)
);

alter table moods enable row level security;
drop policy if exists "Users can manage own moods" on moods;
create policy "Users can manage own moods" on moods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop trigger if exists set_updated_at on moods;
create trigger set_updated_at before update on moods for each row execute function public.set_updated_at();
create index if not exists moods_user_updated_idx on moods (user_id, updated_at);

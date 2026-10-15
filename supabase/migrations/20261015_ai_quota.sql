-- AI quotas (#37): per-user daily counters and a Pro flag the paywall (#40) will set.
alter table profiles add column if not exists is_pro boolean not null default false;

create table if not exists ai_usage (
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  nudges      integer not null default 0,
  reflections integer not null default 0,
  suggestions integer not null default 0,
  primary key (user_id, date)
);
alter table ai_usage enable row level security;
drop policy if exists "Users can read own ai usage" on ai_usage;
create policy "Users can read own ai usage" on ai_usage for select using (auth.uid() = user_id);

-- Atomic "try to consume one unit" used by the edge functions (service role).
create or replace function public.ai_consume(p_user uuid, p_date date, p_kind text, p_limit integer)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cur integer;
begin
  insert into ai_usage (user_id, date) values (p_user, p_date) on conflict do nothing;
  execute format('select %I from ai_usage where user_id = $1 and date = $2 for update', p_kind)
    into cur using p_user, p_date;
  if cur >= p_limit then
    return false;
  end if;
  execute format('update ai_usage set %I = %I + 1 where user_id = $1 and date = $2', p_kind, p_kind)
    using p_user, p_date;
  return true;
end;
$$;

-- Anonymous (guest) users who never linked a sign-in and have not been seen for
-- 90 days are deleted together with their rows (cascades through user_id FKs where
-- present; the app tables are cleaned explicitly). Scheduled daily with pg_cron.
create extension if not exists pg_cron;

create or replace function public.purge_orphan_guest_users()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  n integer := 0;
  r record;
begin
  for r in
    select id from auth.users
    where is_anonymous = true
      and coalesce(last_sign_in_at, created_at) < now() - interval '90 days'
  loop
    delete from habits where user_id = r.id;
    delete from completions where user_id = r.id;
    delete from challenges where user_id = r.id;
    delete from past_challenges where user_id = r.id;
    delete from settings where user_id = r.id;
    delete from daily_snapshots where user_id = r.id;
    delete from ai_nudges where user_id = r.id;
    delete from ai_reflections where user_id = r.id;
    delete from profiles where user_id = r.id;
    delete from auth.users where id = r.id;
    n := n + 1;
  end loop;
  return n;
end;
$$;

select cron.schedule('purge-orphan-guests', '17 4 * * *', $$select public.purge_orphan_guest_users()$$)
where not exists (select 1 from cron.job where jobname = 'purge-orphan-guests');

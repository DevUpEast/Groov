-- #194: Claude Haiku 5.5 could spend the whole max_tokens budget on thinking and
-- return no text; the functions then cached the empty reply and charged quota.

-- Give back one unit consumed by ai_consume (never below zero). Called by the edge
-- functions (service role) when a generation fails or comes back empty.
create or replace function public.ai_refund(p_user uuid, p_date date, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_kind not in ('nudges', 'reflections', 'suggestions') then
    raise exception 'unknown ai quota kind %', p_kind;
  end if;
  execute format('update ai_usage set %I = greatest(%I - 1, 0) where user_id = $1 and date = $2', p_kind, p_kind)
    using p_user, p_date;
end;
$$;

revoke all on function public.ai_refund(uuid, date, text) from public, anon, authenticated;
revoke all on function public.ai_consume(uuid, date, text, integer) from public, anon, authenticated;
grant execute on function public.ai_refund(uuid, date, text) to service_role;
grant execute on function public.ai_consume(uuid, date, text, integer) to service_role;

-- Drop the empty cached replies and refund the nudge each one cost on its day.
with gone as (
  delete from ai_nudges
  where message is null or btrim(message) = ''
  returning user_id, date
)
update ai_usage u
set nudges = greatest(u.nudges - 1, 0)
from gone
where u.user_id = gone.user_id and u.date = gone.date::date;

delete from ai_reflections where message is null or btrim(message) = '';

-- Belt and braces: the cache tables can no longer hold a blank reply.
alter table ai_nudges drop constraint if exists ai_nudges_message_not_blank;
alter table ai_nudges add constraint ai_nudges_message_not_blank check (btrim(message) <> '');
alter table ai_reflections drop constraint if exists ai_reflections_message_not_blank;
alter table ai_reflections add constraint ai_reflections_message_not_blank check (btrim(message) <> '');

-- #201: the coach answers in the app's UI language, so a cached nudge or reflection
-- belongs to one language. Key both caches by locale; existing rows were all English.

alter table ai_nudges add column if not exists locale text not null default 'en';
alter table ai_nudges drop constraint if exists ai_nudges_user_id_date_key;
alter table ai_nudges drop constraint if exists ai_nudges_user_id_date_locale_key;
alter table ai_nudges add constraint ai_nudges_user_id_date_locale_key unique (user_id, date, locale);

alter table ai_reflections add column if not exists locale text not null default 'en';
alter table ai_reflections drop constraint if exists ai_reflections_user_id_period_period_start_key;
alter table ai_reflections drop constraint if exists ai_reflections_user_id_period_period_start_locale_key;
alter table ai_reflections add constraint ai_reflections_user_id_period_period_start_locale_key
  unique (user_id, period, period_start, locale);

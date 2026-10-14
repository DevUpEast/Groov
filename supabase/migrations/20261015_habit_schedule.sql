-- Flexible schedules (#19). A null schedule means "every day", which is what every
-- habit was before this column existed. Shapes:
--   {"type":"daily"}
--   {"type":"weekdays","days":[1,2,3,4,5]}   (0 = Sunday)
--   {"type":"perWeek","target":3}
alter table habits
  add column if not exists schedule jsonb;

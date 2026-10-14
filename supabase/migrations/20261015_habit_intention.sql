-- Implementation intention (#25): "After I <cue>, I will <habit>", set during
-- onboarding or in the habit form. Used in the reminder body and habit detail.
alter table habits
  add column if not exists intention text;

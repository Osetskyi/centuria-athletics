-- Centuria Analytics v13.44: allow serialized historical standings in team notes.
-- Existing goals and team notes remain unchanged; only the maximum stored note length increases.
alter table public.centuria_analytics_team_notes
  drop constraint if exists centuria_analytics_team_notes_note_check;

alter table public.centuria_analytics_team_notes
  add constraint centuria_analytics_team_notes_note_check
  check (char_length(note) <= 20000);

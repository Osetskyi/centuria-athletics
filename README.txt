Centuria v12.71 — club database and calendar patch

Replace these files in the site repository with the versions in this archive:
- app.js
- arena.js

Changes:
- Wait for the shared club database before opening the club database modal, preventing the temporary local list from flashing first.
- On an ADMIN browser, restore blank Supabase logo fields from locally cached club emblems without overwriting existing emblems.
- When a calendar day has one scheduled gathering, show the day action sheet (training, cup, league, plus the gathering row) first. The ratings form opens only after selecting the gathering row.

Logo recovery depends on the original emblem still being present in the ADMIN browser local cache.

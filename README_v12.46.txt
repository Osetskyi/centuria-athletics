Centuria Athletics v12.46 — League arrows after the last accepted result

Replace these files on the site:
- app.js
- arena.js
- arena-active-event-v1233.js
- index.html
- preview.html
- service-worker.js

Supabase backend support (centuria_arena_match_action_v1246) has already been installed in the connected project.

What changed:
- movement is compared with the table immediately before the most recently accepted/edited League result;
- works even when results are entered out of round order;
- green ↑ = moved up, red ↓ = moved down, — = unchanged;
- the stored marker is shared through Supabase, so all users see the same movement after refresh.

Note: results entered before v12.46 cannot be reconstructed reliably; the exact marker is created from the next accepted/edited League result.

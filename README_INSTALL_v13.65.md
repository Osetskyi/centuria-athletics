# Centuria Athletics — v13.65 league archive fix

This patch keeps the v13.63 cup/league photo, GIF, and video covers and the v13.64 emblem-scale fix. It also makes tournament closure save the archive and clear the active event together, confirms the shared Supabase state, ignores older in-flight state responses, and opens the matching History tab after closure.

## Apply

1. Extract the patch into the site's root folder and replace `index.html` and `arena.js`.
2. Keep `club-logo-crop-v1364.css`, `analytics-league-v1363.js`, and `tournament-media-v1363.css` beside `index.html`.
3. Run the included SQL once on the site's Supabase database if the v13.63 tournament-media migration has not already been applied.

No database schema change is needed for the archive fix.

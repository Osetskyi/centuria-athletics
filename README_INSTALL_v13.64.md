# Centuria Athletics — v13.64 media and emblem-crop patch

This update includes the v13.63 optional cup/league cover media and fixes national-team / club emblem crop saving. Scale and position are saved with the emblem record, so external emblem URLs can be adjusted without browser canvas access or a storage migration.

## Apply

1. Extract the patch into the site's root folder and replace `index.html` and `arena.js`.
2. Keep `club-logo-crop-v1364.css`, `analytics-league-v1363.js`, and `tournament-media-v1363.css` beside `index.html`.
3. Run the included SQL once on the site's Supabase database if the v13.63 tournament-media migration has not already been applied.

The v13.64 emblem-crop update does not require a database schema change.

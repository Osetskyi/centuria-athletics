# Centuria Athletics — v13.69 Analytics Center layout recovery

Restores the Analytics Center's known-working data logic without the missing `cover_path` query and adds the missing mobile/desktop styles for the League/Cup tabs, Cup overview, and bracket. Arena v13.66 remains included. No database rows or SQL migrations are changed.

## Apply

Upload and overwrite these seven site files:

- `index.html`
- `app.js`
- `service-worker.js`
- `arena.js`
- `analytics-league-v1364.js`
- `analytics-center-v1348.css`
- `analytics-center-v1369.css`

Then fully close the installed site/PWA and open it again. The bumped service worker and asset URLs clear the previous cached layout.

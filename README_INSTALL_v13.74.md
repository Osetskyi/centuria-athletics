# Centuria Athletics — v13.74 Arena archive sync fix

Arena now keeps the shared Supabase archive as its canonical in-memory source after sync. History and EVO no longer reload an older localStorage copy over the shared archive, including when a local cache write fails. The League entry remains in the League tab; the selected History tab behavior is unchanged. Analytics Center files are not changed.

The shared archive currently contains Centuria Superliga 🇪🇺 with 18 rounds and 72 scored matches.

## Apply

Replace `index.html` and `arena.js` on the site, then reopen the installed site/PWA.

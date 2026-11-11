# Centuria Athletics — v13.67 Analytics Center restore

Restores the Analytics Center files and loading path to the known-working v13.62 implementation, which does not query the missing `cover_path` column. Keeps the Arena v13.66 update in place. No database, Analytics data, or SQL migration is changed.

## Apply

Extract the patch and replace these files on the site:

- `index.html`
- `arena.js`
- `analytics-league-v1348.js`
- `analytics-center-v1348.css`

The updated index loads the restored Analytics Center implementation and retains Arena v13.66.

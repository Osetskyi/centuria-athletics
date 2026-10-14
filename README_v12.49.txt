Centuria Athletics v12.49 SMALL PATCH

Fixes:
- Arena > EVO and Arena > Players now list only the currently existing
  players provided by the live app/Supabase roster. Former members such
  as vladiks56 do not reappear through the old demo list.
- Numbered rankings recalculate automatically; existing EVO points for
  remaining players are computed from the same tournament and match history.
- Tournament participants, results and archives are not deleted or changed.
- Settings displays v12.49 consistently instead of the older v12.47 override.
- PWA service worker cache version and asset cache-busters updated.
- The v12.48 recovery of the Osetskyi_3 3:0 table arrows is retained.

Replace these 5 files in your existing website:
  arena.js
  arena-active-event-v1233.js
  index.html
  preview.html
  service-worker.js

Do NOT delete the other original site assets (app.js, CSS, images etc.).
This archive is a small patch, not a complete stand-alone site.

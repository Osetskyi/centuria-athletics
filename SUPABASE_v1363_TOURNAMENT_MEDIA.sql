-- Optional images, animated GIFs, and looping videos for analytics leagues/cups.
-- Uploads are public to view, limited to ADMIN for writes, and capped at 6 MiB.

ALTER TABLE public.centuria_analytics_leagues
  ADD COLUMN IF NOT EXISTS cover_path text,
  ADD COLUMN IF NOT EXISTS cover_mime_type text;

ALTER TABLE public.centuria_analytics_cups
  ADD COLUMN IF NOT EXISTS cover_path text,
  ADD COLUMN IF NOT EXISTS cover_mime_type text;

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'centuria-tournament-media',
  'centuria-tournament-media',
  true,
  6291456,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'video/mp4', 'video/webm', 'video/quicktime'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS centuria_tournament_media_public_read ON storage.objects;
DROP POLICY IF EXISTS centuria_tournament_media_admin_insert ON storage.objects;
DROP POLICY IF EXISTS centuria_tournament_media_admin_delete ON storage.objects;

CREATE POLICY centuria_tournament_media_admin_insert
  ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'centuria-tournament-media'
    AND public.is_admin()
  );

CREATE POLICY centuria_tournament_media_admin_delete
  ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'centuria-tournament-media'
    AND public.is_admin()
  );

COMMENT ON COLUMN public.centuria_analytics_leagues.cover_path IS
  'Optional uploaded image/video path in the centuria-tournament-media bucket.';
COMMENT ON COLUMN public.centuria_analytics_leagues.cover_mime_type IS
  'Uploaded cover MIME type; video covers are played muted in a loop.';
COMMENT ON COLUMN public.centuria_analytics_cups.cover_path IS
  'Optional uploaded image/video path in the centuria-tournament-media bucket.';
COMMENT ON COLUMN public.centuria_analytics_cups.cover_mime_type IS
  'Uploaded cover MIME type; video covers are played muted in a loop.';

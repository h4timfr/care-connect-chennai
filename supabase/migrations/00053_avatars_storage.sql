-- Profile photos. A private bucket holding at most one object per account, at '<auth user id>/avatar'.
-- The browser re-encodes photos (square, max 512 px, WebP or JPEG) before upload, which also strips
-- camera metadata such as GPS location; the bucket limits below reject anything else server-side.
-- Access is owner-only: a signed-in user can read, create, replace and delete exactly their own object
-- and nothing else. No public URLs (public = false); the app reads photos through short-lived signed URLs,
-- which Storage only issues to a caller whose SELECT policy allows the object. Clinics and other patients
-- cannot read patient photos, and anon has no policy at all (so no access).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('avatars', 'avatars', false, 1048576, ARRAY['image/webp', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The exact object path is the whole rule: no other names in the user's folder, no other folders.
DROP POLICY IF EXISTS avatars_select_own ON storage.objects;
CREATE POLICY avatars_select_own ON storage.objects
FOR SELECT TO authenticated
USING (bucket_id = 'avatars' AND name = (SELECT auth.uid())::text || '/avatar');

DROP POLICY IF EXISTS avatars_insert_own ON storage.objects;
CREATE POLICY avatars_insert_own ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (bucket_id = 'avatars' AND name = (SELECT auth.uid())::text || '/avatar');

-- Replacing a photo (upsert) updates the row; WITH CHECK stops it being renamed onto another path.
DROP POLICY IF EXISTS avatars_update_own ON storage.objects;
CREATE POLICY avatars_update_own ON storage.objects
FOR UPDATE TO authenticated
USING (bucket_id = 'avatars' AND name = (SELECT auth.uid())::text || '/avatar')
WITH CHECK (bucket_id = 'avatars' AND name = (SELECT auth.uid())::text || '/avatar');

DROP POLICY IF EXISTS avatars_delete_own ON storage.objects;
CREATE POLICY avatars_delete_own ON storage.objects
FOR DELETE TO authenticated
USING (bucket_id = 'avatars' AND name = (SELECT auth.uid())::text || '/avatar');

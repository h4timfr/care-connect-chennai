BEGIN;
SELECT extensions.plan(21);

-- Bucket: private, small, images only
SELECT extensions.is((SELECT public FROM storage.buckets WHERE id = 'avatars'), false, 'avatars bucket is private');
SELECT extensions.is((SELECT file_size_limit::bigint FROM storage.buckets WHERE id = 'avatars'), 1048576::bigint, 'avatars are limited to 1 MB');
SELECT extensions.is(
    (SELECT array_agg(t ORDER BY t) FROM storage.buckets, unnest(allowed_mime_types) t WHERE id = 'avatars'),
    ARRAY['image/jpeg', 'image/png', 'image/webp'],
    'avatars accept only JPEG, PNG and WebP'
);
SELECT extensions.is(
    (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'avatars\_%'),
    4, 'avatars has exactly the four owner policies'
);
SELECT extensions.is(
    (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname LIKE 'avatars\_%' AND roles <> ARRAY['authenticated']::name[]),
    0, 'avatar policies apply only to authenticated'
);

-- Fixtures: two accounts; B already has a photo
INSERT INTO auth.users (id, email, created_at, updated_at) VALUES
('00000000-0000-0000-0000-0000000000f1', 'a@test.com', now(), now()),
('00000000-0000-0000-0000-0000000000f2', 'b@test.com', now(), now());
INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('avatars', '00000000-0000-0000-0000-0000000000f2/avatar', '00000000-0000-0000-0000-0000000000f2');

-- Account A
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.lives_ok(
    $$ INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('avatars', '00000000-0000-0000-0000-0000000000f1/avatar', '00000000-0000-0000-0000-0000000000f1') $$,
    'a user can upload their own avatar'
);
SELECT extensions.is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'avatars'), 1, 'a user sees only their own avatar');
SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('avatars', '00000000-0000-0000-0000-0000000000f2/avatar', '00000000-0000-0000-0000-0000000000f1') $$,
    '42501', NULL, 'a user cannot write into another account''s path'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('avatars', '00000000-0000-0000-0000-0000000000f1/other.png', '00000000-0000-0000-0000-0000000000f1') $$,
    '42501', NULL, 'a user cannot store other files in their own folder'
);
SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('avatars', '00000000-0000-0000-0000-0000000000f1/avatar/../../00000000-0000-0000-0000-0000000000f2/avatar', '00000000-0000-0000-0000-0000000000f1') $$,
    '42501', NULL, 'path tricks cannot reach another account'
);
SELECT extensions.throws_ok(
    $$ UPDATE storage.objects SET name = '00000000-0000-0000-0000-0000000000f2/avatar' WHERE name = '00000000-0000-0000-0000-0000000000f1/avatar' $$,
    '42501', NULL, 'a user cannot move their avatar onto another account''s path'
);
SELECT extensions.lives_ok(
    $$ UPDATE storage.objects SET metadata = '{"replaced": true}' WHERE name = '00000000-0000-0000-0000-0000000000f1/avatar' $$,
    'a user can replace their own avatar'
);
-- Another account's object is invisible to UPDATE/DELETE, so nothing happens to it
UPDATE storage.objects SET metadata = '{"tampered": true}' WHERE name = '00000000-0000-0000-0000-0000000000f2/avatar';
DELETE FROM storage.objects WHERE name = '00000000-0000-0000-0000-0000000000f2/avatar';
RESET role;
SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE name = '00000000-0000-0000-0000-0000000000f2/avatar' AND metadata IS NULL),
    1, 'another account''s avatar was neither changed nor deleted'
);

SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.lives_ok(
    $$ DELETE FROM storage.objects WHERE name = '00000000-0000-0000-0000-0000000000f1/avatar' $$,
    'a user can remove their own avatar'
);
SELECT extensions.is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'avatars'), 0, 'after removal the user has no avatar');
RESET role;

-- Signed in without a user id: nothing
SET LOCAL request.jwt.claims TO '{"role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'avatars'), 0, 'no user id sees no avatars');
SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', 'null/avatar') $$,
    '42501', NULL, 'no user id cannot upload'
);
RESET role;

-- Anonymous: nothing
SET LOCAL role anon;
SELECT extensions.is((SELECT count(*)::int FROM storage.objects WHERE bucket_id = 'avatars'), 0, 'anon sees no avatars');
SELECT extensions.throws_ok(
    $$ INSERT INTO storage.objects (bucket_id, name) VALUES ('avatars', '00000000-0000-0000-0000-0000000000f1/avatar') $$,
    '42501', NULL, 'anon cannot upload'
);
RESET role;

-- Clinic staff are ordinary authenticated users here: no access to patients' photos
SET LOCAL request.jwt.claims TO '{"sub": "00000000-0000-0000-0000-0000000000f1", "role": "authenticated"}';
SET LOCAL role authenticated;
SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE name = '00000000-0000-0000-0000-0000000000f2/avatar'),
    0, 'no account can read another account''s photo'
);
RESET role;
SELECT extensions.is(
    (SELECT count(*)::int FROM storage.objects WHERE name = '00000000-0000-0000-0000-0000000000f2/avatar'),
    1, 'the other photo still exists'
);

SELECT * FROM extensions.finish();
ROLLBACK;

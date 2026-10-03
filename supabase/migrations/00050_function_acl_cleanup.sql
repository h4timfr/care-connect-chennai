-- Remove direct client EXECUTE from trigger/internal functions. Supabase default privileges grant EXECUTE on new public
-- functions to PUBLIC/anon/authenticated, and earlier migrations only revoked it on some of them.
-- Trigger firing does not check EXECUTE on the trigger function, so trigger behaviour is unchanged.
-- Verified: the only .rpc() calls in the frontend are book_appointment, toggle_saved_doctor, toggle_saved_clinic and
-- get_doctor_slots(uuid, uuid, date); none of the functions below is called by any client.
REVOKE ALL ON FUNCTION public.check_appointment_overlap() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_clinic_update()       FROM PUBLIC, anon, authenticated;

-- Superseded by the clinic-aware get_doctor_slots(uuid, uuid, date); dropped later by the deferred cleanup migration.
REVOKE ALL ON FUNCTION public.get_doctor_availability(uuid, date) FROM PUBLIC, anon, authenticated;

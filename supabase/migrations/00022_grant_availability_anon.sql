-- Allow anonymous users to view doctor availability so public discovery works
GRANT EXECUTE ON FUNCTION public.get_doctor_availability(uuid, date) TO anon;

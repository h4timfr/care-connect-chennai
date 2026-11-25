import { supabase } from "./client";

export async function providerSubmissionAuthorization(ownerId: string) {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  if (data.session?.user.id !== ownerId || !data.session.access_token) {
    throw Object.assign(new Error("Provider application session changed."), { code: "PGRST301" });
  }

  // Postgres derives applicant_id from auth.uid(). Pin this request to the checked session so
  // an account switch during the SDK's async fetch cannot send the form using a different JWT.
  return `Bearer ${data.session.access_token}`;
}

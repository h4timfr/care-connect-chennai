import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PortalAuthCard, ProviderSignIn, type PortalAccess } from "@/components/ProviderAuth";
import { useI18n } from "@/lib/i18n";
import { safeRedirect } from "@/lib/redirect";
import { useAuth } from "@/lib/supabase/auth";
import { useMyDoctor } from "@/lib/supabase/doctor";

export const Route = createFileRoute("/doctor/login")({
  validateSearch: ({ redirect }: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect: typeof redirect === "string" ? redirect : undefined,
  }),
  head: () => ({ meta: [{ title: "Doctor Portal sign in — CareConnect" }] }),
  component: DoctorLogin,
});

function DoctorLogin() {
  const { t } = useI18n();
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  // Only an account CareConnect has linked to a doctor profile is a doctor (doctors.user_id,
  // set solely by a platform admin). Visiting this page changes nothing about the account.
  const doctor = useMyDoctor(user?.id);

  const access: PortalAccess | null = !user
    ? null
    : doctor.isLoading
      ? { status: "checking" }
      : doctor.error
        ? { status: "error", error: doctor.error, retry: () => void doctor.refetch() }
        : doctor.data
          ? { status: "granted" }
          : { status: "denied" };

  const target = search.redirect?.startsWith("/doctor") ? safeRedirect(search.redirect) : "/doctor";
  useEffect(() => {
    if (access?.status === "granted") navigate({ to: target, replace: true });
  }, [access?.status, navigate, target]);

  return (
    <PortalAuthCard
      portal="doctor"
      title={t("portal.doctor.title")}
      subtitle={t("portal.doctor.subtitle")}
    >
      <ProviderSignIn portal="doctor" access={access} />
    </PortalAuthCard>
  );
}

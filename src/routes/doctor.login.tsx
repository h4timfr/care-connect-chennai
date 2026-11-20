import { pageTitles } from "@/lib/page-titles";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PortalAuthCard, ProviderSignIn, type PortalAccess } from "@/components/ProviderAuth";
import { useI18n } from "@/lib/i18n";
import { safeRedirect } from "@/lib/redirect";
import { useAuth } from "@/lib/supabase/auth";
import { useMyDoctor, useMyDoctorApplications } from "@/lib/supabase/doctor";
import { isNotDeployed } from "@/lib/supabase/errors";

export const Route = createFileRoute("/doctor/login")({
  validateSearch: ({ redirect }: Record<string, unknown>): { redirect?: string | undefined } => ({
    redirect: typeof redirect === "string" ? redirect : undefined,
  }),
  head: () => ({ meta: [{ title: pageTitles.doctor }] }),
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
  const applications = useMyDoctorApplications(doctor.data === null ? user?.id : undefined);
  const hasApplication = (applications.data?.length ?? 0) > 0 && !applications.error;

  const access: PortalAccess | null = !user
    ? null
    : doctor.isLoading || (doctor.data === null && applications.isLoading)
      ? { status: "checking" }
      : doctor.error
        ? { status: "error", error: doctor.error, retry: () => void doctor.refetch() }
        : doctor.data
          ? { status: "granted" }
          : applications.error && !isNotDeployed(applications.error)
            ? {
                status: "error",
                error: applications.error,
                retry: () => void applications.refetch(),
              }
            : { status: "denied" };

  const target = search.redirect?.startsWith("/doctor") ? safeRedirect(search.redirect) : "/doctor";
  useEffect(() => {
    if (access?.status === "granted") navigate({ to: target, replace: true });
    else if (hasApplication) navigate({ to: "/doctor", replace: true });
  }, [access?.status, hasApplication, navigate, target]);

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

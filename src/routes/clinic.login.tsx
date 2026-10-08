import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { PortalAuthCard, ProviderSignIn, type PortalAccess } from "@/components/ProviderAuth";
import { useI18n } from "@/lib/i18n";
import { safeRedirect } from "@/lib/redirect";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth";

export const Route = createFileRoute("/clinic/login")({
  validateSearch: ({ redirect }: Record<string, unknown>): { redirect?: string | undefined } => ({
    // Still checked by safeRedirect() before use.
    redirect: typeof redirect === "string" ? redirect : undefined,
  }),
  head: () => ({ meta: [{ title: "Clinic Portal sign in — CareConnect" }] }),
  component: ClinicLogin,
});

function ClinicLogin() {
  const { t } = useI18n();
  const { user } = useAuth();
  const search = Route.useSearch();
  const navigate = useNavigate();
  // The account's active memberships, as RLS returns them. Signing in alone grants nothing.
  const { memberClinics, isLoadingClinicAccess, clinicAccessError, refetchClinicAccess } = useApp();

  const access: PortalAccess | null = !user
    ? null
    : isLoadingClinicAccess
      ? { status: "checking" }
      : clinicAccessError
        ? { status: "error", error: clinicAccessError, retry: () => void refetchClinicAccess() }
        : memberClinics.length > 0
          ? { status: "granted" }
          : { status: "denied" };

  const target = search.redirect?.startsWith("/clinic") ? safeRedirect(search.redirect) : "/clinic";
  useEffect(() => {
    if (access?.status === "granted") navigate({ to: target, replace: true });
  }, [access?.status, navigate, target]);

  return (
    <PortalAuthCard
      portal="clinic"
      title={t("portal.clinic.title")}
      subtitle={t("portal.clinic.subtitle")}
    >
      <ProviderSignIn portal="clinic" access={access} />
    </PortalAuthCard>
  );
}

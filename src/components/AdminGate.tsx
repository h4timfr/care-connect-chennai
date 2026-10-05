import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";
import type { ReactNode } from "react";
import { ErrorState, InfoNotice, PageLoader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { useI18n } from "@/lib/i18n";
import { describeDataError, isNotDeployed } from "@/lib/supabase/errors";
import { usePlatformAdmin } from "@/lib/supabase/providers";

/**
 * Shows `children` only when the database confirms the platform_admin role (user_roles, read under
 * RLS). Loading, errors and "no" all render a closed state. This is presentation only: every admin
 * query and action is authorised again by RLS / SECURITY DEFINER checks in the database.
 */
export function AdminGate({ children }: { children: ReactNode }) {
  const { user, loading } = useProtectedRoute();
  const { t } = useI18n();
  const role = usePlatformAdmin(user?.id);

  if (loading || !user || role.isLoading) {
    return (
      <PageLoader
        label={!loading && !user ? t("common.redirectingToSignIn") : t("admin.checking")}
      />
    );
  }
  if (role.error) {
    // Fail closed: a role lookup that errors grants nothing.
    return isNotDeployed(role.error) ? (
      <InfoNotice>{t("admin.notDeployed")}</InfoNotice>
    ) : (
      <ErrorState
        title={t("admin.checkError")}
        message={t(describeDataError(role.error))}
        onRetry={role.refetch}
      />
    );
  }
  if (!role.data) {
    return (
      <div className="flex flex-col items-center py-16 text-center">
        <ShieldAlert className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
        <h2 className="font-display text-xl font-bold">{t("admin.noAccessTitle")}</h2>
        <p className="mt-2 max-w-md text-muted-foreground">{t("admin.noAccessBody")}</p>
        <Button asChild className="mt-6">
          <Link to="/">{t("clinicShell.goToApp")}</Link>
        </Button>
      </div>
    );
  }
  return <>{children}</>;
}

import { useNavigate } from "@tanstack/react-router";
import { UserX } from "lucide-react";
import { EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/supabase/auth";
import { useI18n } from "@/lib/i18n";

/**
 * Signed in, but no `patients` row exists. Profiles are provisioned by database triggers at
 * registration, so the browser must not try to create one itself.
 */
export function MissingProfile({
  action,
}: {
  /** What the page needed the profile for. */
  action: "profile" | "book" | "appointments" | "messages";
}) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <EmptyState
      icon={UserX}
      title={t("missingProfile.title")}
      description={t(`missingProfile.${action}`, { email: user?.email ?? "" })}
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await signOut();
            navigate({ to: "/login" });
          }}
        >
          {t("common.signOut")}
        </Button>
      }
    />
  );
}

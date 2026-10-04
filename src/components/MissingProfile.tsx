import { useNavigate } from "@tanstack/react-router";
import { UserX } from "lucide-react";
import { EmptyState } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/supabase/auth";

/**
 * Signed in, but no `patients` row exists. Profiles are provisioned by database triggers at
 * registration, so the browser must not try to create one itself.
 */
export function MissingProfile({ action }: { action: string }) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  return (
    <EmptyState
      icon={UserX}
      title="Patient profile not found"
      description={`You're signed in${user?.email ? ` as ${user.email}` : ""}, but this account has no patient profile, so it can't ${action}. Profiles are created automatically when an account is registered, so this account needs to be repaired by a CareConnect administrator.`}
      action={
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await signOut();
            navigate({ to: "/login" });
          }}
        >
          Sign out
        </Button>
      }
    />
  );
}

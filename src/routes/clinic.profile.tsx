import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { Building2 } from "lucide-react";
import { EmptyState } from "@/components/common";

export const Route = createFileRoute("/clinic/profile")({
  component: ClinicProfileSettings,
});

function ClinicProfileSettings() {
  return (
    <ClinicShell title="Clinic Profile" description="Update clinic information">
      <EmptyState
        icon={Building2}
        title="Clinic Profile"
        description="The clinic profile view is currently under development."
      />
    </ClinicShell>
  );
}

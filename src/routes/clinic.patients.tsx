import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { Users } from "lucide-react";
import { EmptyState } from "@/components/common";

export const Route = createFileRoute("/clinic/patients")({
  component: ClinicPatients,
});

function ClinicPatients() {
  return (
    <ClinicShell title="Patients" description="Manage patient records">
      <EmptyState
        icon={Users}
        title="Patient Records"
        description="The patient records view is currently under development."
      />
    </ClinicShell>
  );
}

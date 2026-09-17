import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { Settings } from "lucide-react";
import { EmptyState } from "@/components/common";

export const Route = createFileRoute("/clinic/settings")({
  component: ClinicSettings,
});

function ClinicSettings() {
  return (
    <ClinicShell title="Settings" description="Application settings">
      <EmptyState
        icon={Settings}
        title="Settings"
        description="The settings view is currently under development."
      />
    </ClinicShell>
  );
}

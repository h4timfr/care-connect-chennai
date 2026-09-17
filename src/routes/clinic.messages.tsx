import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/common";

export const Route = createFileRoute("/clinic/messages")({
  component: ClinicMessages,
});

function ClinicMessages() {
  return (
    <ClinicShell title="Messages" description="Communicate with patients">
      <EmptyState
        icon={MessageSquare}
        title="Clinic Inbox"
        description="The clinic inbox view is currently under development. Patients can message you, and responses will be handled by the prototype logic."
      />
    </ClinicShell>
  );
}

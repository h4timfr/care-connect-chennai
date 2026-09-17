import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { CalendarRange } from "lucide-react";
import { EmptyState } from "@/components/common";

export const Route = createFileRoute("/clinic/calendar")({
  component: ClinicCalendar,
});

function ClinicCalendar() {
  return (
    <ClinicShell title="Calendar" description="View and manage daily schedules">
      <EmptyState
        icon={CalendarRange}
        title="Calendar View"
        description="The calendar view is currently under development. Please use the Appointments tab to manage schedules."
      />
    </ClinicShell>
  );
}

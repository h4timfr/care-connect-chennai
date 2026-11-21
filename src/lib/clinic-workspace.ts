import { isAppointmentInPast } from "@/lib/appointment-time";
import type { AgendaView } from "@/lib/clinic-agenda-view";
import { isoDate } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n";
import type { Appointment, AppointmentStatus } from "@/lib/types";

type AgendaFilters = {
  view: AgendaView;
  date?: string;
  doctorId?: string;
  status?: AppointmentStatus;
};

export function clinicAgenda(
  appointments: Appointment[],
  clinicId: string,
  { view, date, doctorId, status }: AgendaFilters,
  now = new Date(),
) {
  const today = isoDate(now);
  const ascending = view === "today" || view === "upcoming" || view === "pending";
  return appointments
    .filter(
      (row) =>
        row.clinicId === clinicId &&
        (!date || row.date === date) &&
        (!doctorId || row.doctorId === doctorId) &&
        (!status || row.status === status),
    )
    .filter((row) => {
      switch (view) {
        case "today":
          return row.date === today;
        case "upcoming":
          return (
            (row.status === "pending" || row.status === "confirmed") &&
            !isAppointmentInPast(row.date, row.time, now)
          );
        case "history":
          return (
            row.status === "completed" ||
            row.status === "cancelled" ||
            isAppointmentInPast(row.date, row.time, now)
          );
        case "pending":
          return row.status === "pending";
        default:
          return true;
      }
    })
    .sort((a, b) => {
      const order = a.date.localeCompare(b.date) || a.time.localeCompare(b.time);
      return ascending ? order : -order;
    });
}

export type AppointmentAction = {
  status: AppointmentStatus;
  label: MessageKey;
  done: MessageKey;
  danger?: boolean;
};

// Matches check_appointment_update in 00061. The trigger authorizes every transition.
export const appointmentActions: Record<AppointmentStatus, AppointmentAction[]> = {
  pending: [
    {
      status: "confirmed",
      label: "clinicAppointments.action.confirm",
      done: "clinicAppointments.done.confirmed",
    },
    {
      status: "cancelled",
      label: "clinicAppointments.action.decline",
      done: "clinicAppointments.done.declined",
      danger: true,
    },
  ],
  confirmed: [
    {
      status: "arrived",
      label: "clinicAppointments.action.arrived",
      done: "clinicAppointments.done.arrived",
    },
    {
      status: "cancelled",
      label: "clinicAppointments.action.cancel",
      done: "clinicAppointments.done.cancelled",
      danger: true,
    },
  ],
  arrived: [
    {
      status: "completed",
      label: "clinicAppointments.action.completed",
      done: "clinicAppointments.done.completed",
    },
  ],
  completed: [],
  cancelled: [],
};

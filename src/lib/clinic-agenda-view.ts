export type AgendaView = "all" | "today" | "upcoming" | "history" | "pending";

export function isAgendaView(value: unknown): value is AgendaView {
  return (
    value === "all" ||
    value === "today" ||
    value === "upcoming" ||
    value === "history" ||
    value === "pending"
  );
}

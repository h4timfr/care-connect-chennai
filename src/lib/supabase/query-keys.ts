export function patientAppointmentsQueryKey(userId?: string, patientId?: string) {
  return ["appointments", "patient", userId, patientId] as const;
}

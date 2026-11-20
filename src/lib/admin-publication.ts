/**
 * Client-side preview of clinic publication changes. The mutation and database
 * remain authoritative; this helper only makes the consequences explicit.
 */
export interface ClinicPublicationSnapshot {
  verificationState: "pending" | "verified" | "rejected";
  isPublished: boolean;
  patientContactPermission: "not_granted" | "granted" | "revoked";
  bookingEnabled: boolean;
}

export interface ClinicPublicationPatch {
  verificationState?: ClinicPublicationSnapshot["verificationState"];
  isPublished?: boolean;
  contactPermission?: ClinicPublicationSnapshot["patientContactPermission"];
  bookingEnabled?: boolean;
}

export interface ClinicPublicationResult {
  verificationState: ClinicPublicationSnapshot["verificationState"];
  isPublished: boolean;
  contactPermission: ClinicPublicationSnapshot["patientContactPermission"];
  bookingEnabled: boolean;
}

export function calculateClinicPublicationState(
  clinic: ClinicPublicationSnapshot,
  patch: ClinicPublicationPatch,
): ClinicPublicationResult {
  const next: ClinicPublicationResult = {
    verificationState: patch.verificationState ?? clinic.verificationState,
    isPublished: patch.isPublished ?? clinic.isPublished,
    contactPermission: patch.contactPermission ?? clinic.patientContactPermission,
    bookingEnabled: patch.bookingEnabled ?? clinic.bookingEnabled,
  };
  if (next.verificationState !== "verified") {
    next.isPublished = false;
    next.contactPermission = "not_granted";
    next.bookingEnabled = false;
  } else if (!next.isPublished) {
    next.contactPermission = "not_granted";
    next.bookingEnabled = false;
  }
  return next;
}

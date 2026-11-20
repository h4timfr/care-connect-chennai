import assert from "node:assert/strict";
import test from "node:test";
import { calculateClinicPublicationState } from "../src/lib/admin-publication";

const baseline = {
  verificationState: "verified" as const,
  isPublished: true,
  patientContactPermission: "granted" as const,
  bookingEnabled: true,
};

test("verification withdrawal immediately previews all public permissions disabled", () => {
  assert.deepEqual(calculateClinicPublicationState(baseline, { verificationState: "pending" }), {
    verificationState: "pending",
    isPublished: false,
    contactPermission: "not_granted",
    bookingEnabled: false,
  });
});

test("unpublishing disables patient contact and booking", () => {
  assert.deepEqual(calculateClinicPublicationState(baseline, { isPublished: false }), {
    verificationState: "verified",
    isPublished: false,
    contactPermission: "not_granted",
    bookingEnabled: false,
  });
});

test("unverified providers cannot become published through a client-side patch", () => {
  const pending = { ...baseline, verificationState: "pending" as const, isPublished: false };
  const actual = calculateClinicPublicationState(pending, {
    isPublished: true,
    bookingEnabled: true,
    contactPermission: "granted",
  });
  assert.equal(actual.isPublished, false);
  assert.equal(actual.bookingEnabled, false);
  assert.equal(actual.contactPermission, "not_granted");
});

test("publication alone does not implicitly grant booking or contact", () => {
  const unpublished = {
    ...baseline,
    isPublished: false,
    bookingEnabled: false,
    patientContactPermission: "not_granted" as const,
  };
  assert.deepEqual(calculateClinicPublicationState(unpublished, { isPublished: true }), {
    verificationState: "verified",
    isPublished: true,
    contactPermission: "not_granted",
    bookingEnabled: false,
  });
});

test("contact permission remains independent of online booking", () => {
  const updated = calculateClinicPublicationState(
    { ...baseline, patientContactPermission: "not_granted" as const, bookingEnabled: false },
    { contactPermission: "granted" },
  );
  assert.equal(updated.contactPermission, "granted");
  assert.equal(updated.bookingEnabled, false);
});

import { canPersistProviderDrafts } from "./supabase/client";

type ProviderPortal = "clinic" | "doctor";
type DraftRecord = { revision: string; form?: object };
export type DraftWrite = { kind: "saved"; revision: string } | { kind: "conflict" | "unavailable" };

// Account scoping prevents accidental reuse by another account in the app. Browser storage
// is plaintext to anyone with access to the browser profile.
function draftKey(portal: ProviderPortal, ownerId: string) {
  return `careconnect.providerApplicationDraft.v1:${portal}:${ownerId}`;
}

export function discardLegacyProviderDrafts() {
  try {
    localStorage.removeItem("careconnect.clinicApplicationDraft");
    localStorage.removeItem("careconnect.doctorApplicationDraft");
  } catch {
    // Legacy entries are never read, even when storage prevents their removal.
  }
}

function readRecord(key: string): DraftRecord | null {
  const raw = localStorage.getItem(key);
  if (raw === null) return null;
  const parsed: unknown = JSON.parse(raw);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    throw new Error("Invalid draft.");
  if ("revision" in parsed && typeof parsed.revision === "string") return parsed as DraftRecord;
  // An earlier, already account-scoped format can be read. Its next cooperating write versions it.
  return { revision: "unversioned", form: parsed };
}

export function readProviderDraft<T extends object>(
  portal: ProviderPortal,
  ownerId: string,
  initial: T,
) {
  const empty = { form: initial, revision: null, saved: false };
  if (!canPersistProviderDrafts) return empty;
  try {
    const record = readRecord(draftKey(portal, ownerId));
    if (!record?.form || typeof record.form !== "object" || Array.isArray(record.form))
      return { ...empty, revision: record?.revision ?? null };

    const form = { ...initial };
    for (const field of Object.keys(initial) as (keyof T)[]) {
      const value: unknown = Reflect.get(record.form, field);
      if (typeof value === "string" && typeof initial[field] === "string") {
        Object.assign(form, { [field]: value });
      }
    }
    return { form, revision: record.revision, saved: true };
  } catch {
    return empty;
  }
}

function updateDraft(
  portal: ProviderPortal,
  ownerId: string,
  expected: string | null,
  form?: object,
): Promise<DraftWrite> {
  if (!canPersistProviderDrafts) return Promise.resolve({ kind: "unavailable" });
  const key = draftKey(portal, ownerId);
  return navigator.locks
    .request(key, (): DraftWrite => {
      if ((readRecord(key)?.revision ?? null) !== expected) return { kind: "conflict" };
      const revision = crypto.randomUUID();
      // A clear replaces the one record with a content-free marker. A delayed signup may
      // initialize an absent slot, but cannot initialize one that was deliberately cleared.
      localStorage.setItem(key, JSON.stringify({ revision, form }));
      return { kind: "saved", revision };
    })
    .catch(() => ({ kind: "unavailable" }));
}

export function saveProviderDraft(
  portal: ProviderPortal,
  ownerId: string,
  form: object,
  expected: string | null,
) {
  return updateDraft(portal, ownerId, expected, form);
}

export function clearProviderDraft(portal: ProviderPortal, ownerId: string, revision: string) {
  return updateDraft(portal, ownerId, revision);
}

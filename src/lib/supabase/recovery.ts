import { useSyncExternalStore } from "react";
import { AuthSessionMissingError, type Session } from "@supabase/supabase-js";
import { authSessionStorage, supabase, updateRecoveryPassword } from "./client";

type Snapshot = NonNullable<
  Awaited<ReturnType<NonNullable<typeof authSessionStorage>["snapshotFor"]>>
>;
type Recovery = { session: Session; snapshot?: Snapshot };

let recovery: Recovery | null = null;
let lastAuthorized: Recovery | null = null;
const listeners = new Set<() => void>();

function setRecovery(value: Recovery | null) {
  if (recovery === value) return;
  recovery = value;
  for (const listener of listeners) listener();
}

function sameSession(left: Session, right: Session | null) {
  return left.access_token === right?.access_token && left.user.id === right.user.id;
}

function authorize(candidate: Recovery) {
  if (
    lastAuthorized &&
    sameSession(lastAuthorized.session, candidate.session) &&
    lastAuthorized.snapshot?.revision === candidate.snapshot?.revision
  )
    return;
  lastAuthorized = candidate;
  setRecovery(candidate);
}

let watching = false;

/** Register before React mounts so the SDK's initial recovery event is observed. */
export function watchPasswordRecovery() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  let eventRevision = 0;
  let previousEvent: Session | null = null;
  supabase.auth.onAuthStateChange((event, session) => {
    if (!authSessionStorage && previousEvent?.access_token !== session?.access_token)
      eventRevision++;
    previousEvent = session;
    if (recovery) {
      const snapshot = recovery.snapshot;
      let current = false;
      try {
        current = snapshot
          ? !!authSessionStorage?.isCurrent(snapshot)
          : sameSession(recovery.session, session);
      } catch {
        // Unreadable storage cannot establish ownership.
      }
      if (!current) setRecovery(null);
    }
    if (event !== "PASSWORD_RECOVERY" || !session) return;
    const revision = ++eventRevision;
    queueMicrotask(() => {
      void (async () => {
        if (authSessionStorage) {
          const snapshot = await authSessionStorage.snapshotFor(session.access_token);
          if (snapshot && revision === eventRevision && authSessionStorage.isCurrent(snapshot))
            authorize({ session, snapshot });
        } else {
          const current = await supabase.auth.getSession();
          if (
            revision === eventRevision &&
            !current.error &&
            sameSession(session, current.data.session)
          )
            authorize({ session });
        }
      })().catch(() => {});
    });
  });
}

export function usePasswordRecovery(verified: Session | null) {
  const candidate = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => recovery,
    () => null,
  );
  return verified && candidate && sameSession(candidate.session, verified) ? candidate : null;
}

export async function saveRecoveryPassword(candidate: Recovery, password: string) {
  async function isCurrent() {
    if (recovery !== candidate) return false;
    if (candidate.snapshot) return !!authSessionStorage?.isCurrent(candidate.snapshot);
    const current = await supabase.auth.getSession();
    return (
      recovery === candidate &&
      !current.error &&
      sameSession(candidate.session, current.data.session)
    );
  }

  const { error } = await updateRecoveryPassword(
    candidate.session,
    password,
    async (input, init) => {
      // The isolated SDK may attempt to refresh a near-expiry session. Only the explicit
      // password request with the original bearer may leave this client.
      if (
        init?.method !== "PUT" ||
        new Headers(init.headers).get("Authorization") !==
          `Bearer ${candidate.session.access_token}` ||
        !(await isCurrent())
      )
        throw new AuthSessionMissingError();

      const dispatch = () => {
        if (recovery !== candidate) throw new AuthSessionMissingError();
        return globalThis.fetch(input, init);
      };
      return candidate.snapshot && authSessionStorage
        ? authSessionStorage.dispatchIfCurrent(candidate.snapshot, dispatch)
        : dispatch();
    },
  );
  if (
    !(await isCurrent()) ||
    recovery !== candidate ||
    (candidate.snapshot && !authSessionStorage?.isCurrent(candidate.snapshot))
  )
    return false;
  if (error) throw error;
  setRecovery(null);
  return true;
}

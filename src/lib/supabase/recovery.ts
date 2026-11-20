import { useSyncExternalStore } from "react";
import { supabase } from "./client";

// auth-js emits PASSWORD_RECOVERY once, right after it reads the session from a reset link, and
// possibly before React has mounted, so the listener must be registered at startup. It's started
// by an explicit call (see auth.tsx) rather than as an import side effect: package.json declares
// "sideEffects": false, so a bare `import "./recovery"` is dropped from production bundles.

let recovering = false;
const listeners = new Set<() => void>();

function setRecovering(value: boolean) {
  if (recovering === value) return;
  recovering = value;
  for (const listener of listeners) listener();
}

let watching = false;

/** Starts tracking PASSWORD_RECOVERY. Call once, at module load of the app shell. */
export function watchPasswordRecovery() {
  if (watching || typeof window === "undefined") return;
  watching = true;
  supabase.auth.onAuthStateChange((event) => {
    if (event === "PASSWORD_RECOVERY") setRecovering(true);
    if (event === "SIGNED_OUT") setRecovering(false);
  });
}

/** Call once the new password is saved, so the reset form can't be reused. */
export function endPasswordRecovery() {
  setRecovering(false);
}

/** True while the current session came from a password-reset link. */
export function useIsPasswordRecovery() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => recovering,
    () => false,
  );
}

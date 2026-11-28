/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  isAuthError,
  isAuthRefreshDiscardedError,
  isAuthRetryableFetchError,
  isAuthSessionMissingError,
  type Session,
  type User,
} from "@supabase/supabase-js";
import { authSessionStorage, isSupabaseConfigured, supabase, verifyAuthUser } from "./client";
import { watchPasswordRecovery } from "./recovery";
import { clearPrivateQueryCache } from "./private-query-cache";
import { useI18n } from "@/lib/i18n";
import { toast } from "@/lib/toast";
import { describeDataError } from "./errors";

// Must run before React mounts so the one-off PASSWORD_RECOVERY event can't be missed.
watchPasswordRecovery();

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<boolean>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

function isTemporaryAuthError(error: unknown) {
  return (
    isAuthRefreshDiscardedError(error) ||
    isAuthRetryableFetchError(error) ||
    (isAuthError(error) && (error.status === 429 || (error.status ?? 0) >= 500))
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const principalId = useRef<string | null>(null);
  const signInGeneration = useRef(0);

  useEffect(() => {
    let generation = 0;
    let verified: Session | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const applySession = (nextSession: Session | null) => {
      const nextPrincipalId = nextSession?.user.id ?? null;
      if (principalId.current !== nextPrincipalId) {
        // A direct A -> B SIGNED_IN event does not pass through a signed-out state.
        clearPrivateQueryCache(queryClient);
        if (nextPrincipalId !== null) signInGeneration.current++;
        principalId.current = nextPrincipalId;
      }
      setSession(nextSession);
      setLoading(false);
    };

    const reconcile = async (request: number) => {
      if (request !== generation) return;
      try {
        const { data, error } = await supabase.auth.getSession();
        if (request !== generation) return;
        if (error) throw error;
        const current = data.session;
        if (!current) {
          if (authSessionStorage && !authSessionStorage.matchesOwner(undefined)) {
            void reconcile(++generation);
            return;
          }
          verified = null;
          applySession(null);
          return;
        }

        const snapshot = await authSessionStorage?.snapshotFor(current.access_token);
        if (request !== generation) return;
        if (authSessionStorage && !snapshot) {
          void reconcile(++generation);
          return;
        }
        if (current.access_token === verified?.access_token) {
          applySession(verified);
          return;
        }
        if (current.user.id !== verified?.user.id) setLoading(true);
        const { data: identity, error: identityError } = await verifyAuthUser(current.access_token);
        if (request !== generation) return;
        const latest = await supabase.auth.getSession();
        if (request !== generation) return;
        if (latest.error) throw latest.error;
        if (
          latest.data.session?.access_token !== current.access_token ||
          (snapshot && !authSessionStorage?.isCurrent(snapshot))
        ) {
          void reconcile(++generation);
          return;
        }
        if (identityError && isTemporaryAuthError(identityError)) throw identityError;
        if (identityError || !identity.user || identity.user.id !== current.user.id) {
          if (snapshot && !(await authSessionStorage?.discard(snapshot))) {
            if (request === generation) void reconcile(++generation);
            return;
          }
          if (request !== generation) return;
          throw new Error("Unable to establish the active account.");
        }

        verified = { ...current, user: identity.user };
        applySession(verified);
      } catch (error) {
        if (request !== generation) return;
        if (isTemporaryAuthError(error)) {
          setLoading(true);
          // Auth can cache a retryable refresh failure for the same token. Yield between reads.
          retry = setTimeout(() => void reconcile(request), 1000);
          return;
        }
        verified = null;
        applySession(null);
      }
    };

    if (!isSupabaseConfigured) {
      applySession(null);
      return;
    }
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, hint) => {
      const owner = verified?.user.id;
      // A stale hint must not discard edits for an already verified account whose session
      // is still present. Storage is used only to invalidate a previously verified account.
      const ownerUnchanged = authSessionStorage?.matchesOwner(owner) ?? hint?.user.id === owner;
      if (!ownerUnchanged) setLoading(true);
      clearTimeout(retry);
      const request = ++generation;
      // Auth events may come from another tab. They signal a reread of the canonical session.
      // Leave the SDK callback stack before calling back into Auth.
      queueMicrotask(() => void reconcile(request));
    });

    return () => {
      generation++;
      clearTimeout(retry);
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const signOut = useCallback(async () => {
    const generation = signInGeneration.current;
    const signingOutOwner = session?.user.id;
    try {
      if (authSessionStorage && session) {
        // Invalidate the local generation before a remote logout can race with a refresh.
        // The remote call uses the account captured from this exact slot, even if it changes now.
        const owned = await authSessionStorage.takeSession(session);
        if (!owned) return false;
        const { error } = await supabase.auth.admin.signOut(owned.access_token, "global");
        if (
          error &&
          !isAuthSessionMissingError(error) &&
          ![401, 403, 404].includes(error.status ?? 0)
        )
          throw error;
      } else if (!authSessionStorage) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
      clearPrivateQueryCache(queryClient);
      return true;
    } catch (error) {
      // A failed remote logout can settle after a different session has replaced the local one.
      if (
        generation === signInGeneration.current &&
        (!authSessionStorage ||
          authSessionStorage.matchesOwner(undefined) ||
          authSessionStorage.matchesOwner(signingOutOwner))
      ) {
        toast.error(t(describeDataError(error)));
      }
      return false;
    }
  }, [queryClient, session, t]);

  return (
    <AuthContext.Provider
      value={{
        session: loading ? null : session,
        user: loading ? null : (session?.user ?? null),
        loading,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}

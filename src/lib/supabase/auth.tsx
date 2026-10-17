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
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "./client";
import { watchPasswordRecovery } from "./recovery";
import { clearPrivateQueryCache } from "./private-query-cache";

// Must run before React mounts so the one-off PASSWORD_RECOVERY event can't be missed.
watchPasswordRecovery();

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthState | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const principalId = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let authEventReceived = false;

    const applySession = (nextSession: Session | null) => {
      if (cancelled) return;
      const nextPrincipalId = nextSession?.user.id ?? null;
      if (principalId.current !== nextPrincipalId) {
        // A direct A -> B SIGNED_IN event does not pass through a signed-out state.
        clearPrivateQueryCache(queryClient);
        principalId.current = nextPrincipalId;
      }
      setSession(nextSession);
      setLoading(false);
    };

    supabase.auth
      .getSession()
      .then(({ data }) => {
        // INITIAL_SESSION/SIGNED_IN can arrive before getSession resolves; never restore an older
        // principal over the newer auth event.
        if (!authEventReceived) applySession(data.session);
      })
      .catch(() => {
        if (!authEventReceived) applySession(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      authEventReceived = true;
      applySession(nextSession);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [queryClient]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    clearPrivateQueryCache(queryClient);
  }, [queryClient]);

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
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

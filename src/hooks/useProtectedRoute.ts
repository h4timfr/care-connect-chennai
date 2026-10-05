import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/supabase/auth";

/** Where each part of the app sends signed-out visitors. */
export type LoginPath = "/login" | "/clinic/login" | "/doctor/login";

/**
 * Sends signed-out visitors to the sign-in page for this part of the app, returning them to the
 * current page afterwards. Signing in is authentication only: the portal pages still check the
 * account's clinic membership or doctor link, which the database enforces.
 */
export function useProtectedRoute(loginPath: LoginPath = "/login") {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const href = useRouterState({ select: (s) => s.location.href });

  useEffect(() => {
    // The protected page can stay mounted for a moment after navigating; never redirect from a
    // sign-in page itself, or the return path would nest /login?redirect=/login?redirect=...
    if (loading || user || pathname === loginPath || pathname.endsWith("/login")) return;
    navigate({ to: loginPath, search: { redirect: href }, replace: true });
  }, [loading, user, pathname, href, navigate, loginPath]);

  return { user, loading };
}

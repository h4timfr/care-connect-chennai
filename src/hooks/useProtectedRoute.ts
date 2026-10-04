import { useEffect } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { useAuth } from "@/lib/supabase/auth";

/** Sends signed-out visitors to /login, returning them to the current page afterwards. */
export function useProtectedRoute() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const href = useRouterState({ select: (s) => s.location.href });

  useEffect(() => {
    // The protected page can stay mounted for a moment after navigating; never redirect from
    // /login itself, or the return path would nest /login?redirect=/login?redirect=...
    if (loading || user || pathname === "/login") return;
    navigate({ to: "/login", search: { redirect: href }, replace: true });
  }, [loading, user, pathname, href, navigate]);

  return { user, loading };
}

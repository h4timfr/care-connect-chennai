import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/lib/supabase/auth";

export function useProtectedRoute(redirectUrl: string = "/") {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/login", search: { redirect: redirectUrl } });
    }
  }, [loading, user, navigate, redirectUrl]);

  return { user, loading };
}

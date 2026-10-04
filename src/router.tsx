import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { isNetworkError } from "./lib/supabase/errors";

const MAX_QUERY_RETRIES = 1;

/** Retry transient failures only; auth, permission and validation errors will not fix themselves. */
function shouldRetry(failureCount: number, error: unknown) {
  if (failureCount >= MAX_QUERY_RETRIES) return false;
  if (error instanceof Error && error.name === "SupabaseConfigError") return false;
  // supabase-js has already retried network failures for reads; don't make the user wait longer.
  if (isNetworkError(error)) return false;
  const code =
    error && typeof error === "object" && "code" in error
      ? String((error as { code: unknown }).code)
      : "";
  // PostgREST (PGRST*) and Postgres SQLSTATE codes describe request problems, not outages.
  return code === "";
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30 * 1000,
        retry: shouldRetry,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};

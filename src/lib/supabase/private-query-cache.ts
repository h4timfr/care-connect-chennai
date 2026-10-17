import type { QueryClient } from "@tanstack/react-query";

const PUBLIC_QUERY_ROOTS = new Set([
  "clinics",
  "doctors",
  "doctor-search",
  "clinic-search",
  "availability",
]);

function isPrivateQuery(query: { queryKey: readonly unknown[] }) {
  return !PUBLIC_QUERY_ROOTS.has(String(query.queryKey[0]));
}

/** Clear account-scoped data before rendering a different authenticated principal. */
export function clearPrivateQueryCache(queryClient: QueryClient) {
  // Cancellation prevents an old in-flight response from repopulating the cache after removal.
  void queryClient.cancelQueries({ predicate: isPrivateQuery });
  queryClient.removeQueries({ predicate: isPrivateQuery });
}

import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { describeDataError } from "@/lib/supabase/errors";

/**
 * Shown on pages that use the doctor/clinic listings only for names: if those failed to load,
 * say so (with a retry) instead of quietly showing incomplete details.
 */
export function CatalogNotice() {
  const { catalog } = useApp();
  if (!catalog.error) return null;
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
    >
      <p className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <span>
          Doctor and clinic details couldn't be loaded, so some names may be missing.{" "}
          {describeDataError(catalog.error)}
        </span>
      </p>
      <Button variant="outline" size="sm" onClick={catalog.refetch}>
        Try again
      </Button>
    </div>
  );
}

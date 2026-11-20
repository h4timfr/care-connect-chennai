import { useEffect, useState, type ComponentType } from "react";
import { connectToastHandler, type ToastRequest } from "@/lib/toast";

type ToasterComponent = ComponentType<{ position: "top-center"; richColors: boolean }>;

export function DeferredToaster() {
  const [Toaster, setToaster] = useState<ToasterComponent | null>(null);
  const [fallbacks, setFallbacks] = useState<ToastRequest[]>([]);

  useEffect(() => {
    let mounted = true;
    const disconnect = connectToastHandler((request) => {
      void Promise.all([import("sonner"), import("@/components/ui/sonner")])
        .then(([sonner, toaster]) => {
          if (!mounted) return;
          setToaster(() => toaster.Toaster);
          sonner.toast[request.kind](request.message, request.options);
        })
        .catch(() => {
          if (mounted) setFallbacks((current) => [...current, request]);
        });
    });

    return () => {
      mounted = false;
      disconnect();
    };
  }, []);

  return (
    <>
      {Toaster ? <Toaster position="top-center" richColors /> : null}
      {fallbacks.length ? (
        <div className="fixed left-1/2 top-4 z-[100] flex w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 flex-col gap-2">
          {fallbacks.map((fallback, index) => (
            <div
              key={`${index}-${fallback.kind}-${fallback.message}`}
              data-testid="toast-fallback-announcement"
              role={fallback.kind === "error" ? "alert" : "status"}
              aria-live={fallback.kind === "error" ? "assertive" : "polite"}
              aria-atomic="true"
              className={`rounded-lg border bg-background px-4 py-3 text-sm shadow-lg ${fallback.kind === "error" ? "border-destructive text-destructive" : "border-border text-foreground"}`}
            >
              {fallback.message}
            </div>
          ))}
        </div>
      ) : null}
    </>
  );
}

import { useEffect, useState, type ComponentType } from "react";
import { connectToastHandler, type ToastRequest } from "@/lib/toast";

type ToasterComponent = ComponentType<{ position: "top-center"; richColors: boolean }>;
type FallbackToast = ToastRequest & { id: number };
const DEFAULT_TOAST_DURATION = 4000;

export function DeferredToaster() {
  const [Toaster, setToaster] = useState<ToasterComponent | null>(null);
  const [fallbacks, setFallbacks] = useState<FallbackToast[]>([]);

  useEffect(() => {
    let mounted = true;
    let nextId = 0;
    const expirationTimers = new Set<ReturnType<typeof setTimeout>>();
    const disconnect = connectToastHandler((request) => {
      void Promise.all([import("sonner"), import("@/components/ui/sonner")])
        .then(([sonner, toaster]) => {
          if (!mounted) return;
          setToaster(() => toaster.Toaster);
          sonner.toast[request.kind](request.message, request.options);
        })
        .catch(() => {
          if (!mounted) return;
          const id = nextId++;
          setFallbacks((current) => [...current, { ...request, id }]);
          const duration = request.options?.duration || DEFAULT_TOAST_DURATION;
          if (duration === Infinity) return;
          const timer = setTimeout(() => {
            expirationTimers.delete(timer);
            setFallbacks((current) => current.filter((fallback) => fallback.id !== id));
          }, duration);
          expirationTimers.add(timer);
        });
    });

    return () => {
      mounted = false;
      disconnect();
      for (const timer of expirationTimers) clearTimeout(timer);
    };
  }, []);

  return (
    <>
      {Toaster ? <Toaster position="top-center" richColors /> : null}
      {fallbacks.length ? (
        <div className="fixed left-1/2 top-4 z-[100] flex w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 flex-col gap-2">
          {fallbacks.map((fallback) => (
            <div
              key={fallback.id}
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

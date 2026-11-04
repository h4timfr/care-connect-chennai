import { lazy, Suspense, useEffect, useState } from "react";
import { connectToastHandler, type ToastRequest } from "@/lib/toast";

const Toaster = lazy(() =>
  import("@/components/ui/sonner").then((module) => ({ default: module.Toaster })),
);

export function DeferredToaster() {
  const [requested, setRequested] = useState(false);

  useEffect(
    () =>
      connectToastHandler((request: ToastRequest) => {
        setRequested(true);
        void import("sonner").then(({ toast }) =>
          toast[request.kind](request.message, request.options),
        );
      }),
    [],
  );

  return requested ? (
    <Suspense fallback={null}>
      <Toaster position="top-center" richColors />
    </Suspense>
  ) : null;
}

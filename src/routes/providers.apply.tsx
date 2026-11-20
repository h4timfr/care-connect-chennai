import { createFileRoute, redirect } from "@tanstack/react-router";

// Clinic applications moved to the clinic portal's registration page; keep old links working.
export const Route = createFileRoute("/providers/apply")({
  beforeLoad: () => {
    throw redirect({ to: "/clinic/signup", replace: true });
  },
});

import { Link } from "@tanstack/react-router";
import { AlertCircle, Stethoscope } from "lucide-react";
import type { ReactNode } from "react";

/** Centered card used by the sign-in, sign-up and password-reset screens. */
export function AuthCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="surface-card w-full max-w-sm rounded-2xl p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link
            to="/"
            className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground"
            aria-label="CareConnect home"
          >
            <Stethoscope className="h-6 w-6" aria-hidden />
          </Link>
          <h1 className="font-display text-2xl font-bold">{title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Inline form error, announced to screen readers. */
export function FormAlert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <p>{children}</p>
    </div>
  );
}

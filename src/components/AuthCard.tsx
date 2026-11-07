import { Link } from "@tanstack/react-router";
import { AlertCircle } from "lucide-react";
import type { ReactNode } from "react";
import { useI18n } from "@/lib/i18n";
import { LanguageSelect } from "@/components/LanguageSelect";
import { BrandMark } from "@/components/BrandMark";

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
  const { t } = useI18n();
  return (
    <div className="relative flex min-h-screen items-center justify-center bg-gradient-to-br from-primary-soft via-background to-highlight-soft px-4 py-16">
      <div className="absolute end-4 top-4">
        <LanguageSelect />
      </div>
      <div className="surface-raised w-full max-w-sm rounded-2xl p-6 sm:p-8">
        <div className="mb-6 flex flex-col items-center text-center">
          <Link
            to="/"
            className="mb-3 rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={t("nav.homeLink")}
          >
            <BrandMark size="lg" />
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

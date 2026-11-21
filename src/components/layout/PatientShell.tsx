import { Link, useRouterState } from "@tanstack/react-router";
import { Building2, CalendarDays, Compass, Home, MessageCircle, User } from "lucide-react";
import { useCallback, useRef, useState, type ReactNode } from "react";
import { useFocusMainOnNavigate } from "@/hooks/useFocusMainOnNavigate";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { ProfileAvatar } from "@/components/ProfileAvatar";
import { LanguageSelect } from "@/components/LanguageSelect";
import { FirstVisitLanguage } from "@/components/FirstVisitLanguage";
import { GuidedTour } from "@/components/GuidedTour";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { BrandMark, SkipToContent } from "@/components/BrandMark";

const NAV: {
  to: "/" | "/discover" | "/appointments" | "/messages" | "/profile";
  label: MessageKey;
  mobileLabel: MessageKey;
  icon: typeof Home;
  exact: boolean;
}[] = [
  { to: "/", label: "nav.home", mobileLabel: "nav.home", icon: Home, exact: true },
  {
    to: "/discover",
    label: "nav.findDoctors",
    mobileLabel: "nav.discover",
    icon: Compass,
    exact: false,
  },
  {
    to: "/appointments",
    label: "nav.appointments",
    mobileLabel: "nav.visits",
    icon: CalendarDays,
    exact: false,
  },
  {
    to: "/messages",
    label: "nav.messages",
    mobileLabel: "nav.messages",
    icon: MessageCircle,
    exact: false,
  },
  { to: "/profile", label: "nav.profile", mobileLabel: "nav.profile", icon: User, exact: false },
];

export function PatientPageHeading({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div className="min-w-0">
      <h1 className="font-display text-2xl leading-tight font-bold tracking-tight [overflow-wrap:anywhere] sm:text-3xl">
        {title}
      </h1>
      {description ? (
        <p className="mt-1 max-w-prose text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  );
}

export function PatientShell({
  children,
  compact = false,
}: {
  children: ReactNode;
  compact?: boolean;
}) {
  const mainRef = useRef<HTMLElement>(null);
  const [startTour, setStartTour] = useState(0);
  const focusMain = useCallback(() => mainRef.current?.focus({ preventScroll: true }), []);
  useFocusMainOnNavigate(mainRef);
  const { patient, activeClinic, isLoadingClinicAccess, clinicAccessError } = useApp();
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAdministration = pathname === "/admin" || pathname.startsWith("/admin/");

  const isActive = (to: string, exact: boolean) =>
    (to === "/discover" &&
      ["/doctors/", "/clinics/", "/book/"].some((prefix) => pathname.startsWith(prefix))) ||
    (exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`));

  return (
    <div
      className={cn(
        "flex min-h-screen flex-col lg:pb-0",
        compact ? "pb-[calc(4.75rem+env(safe-area-inset-bottom))]" : "pb-32",
      )}
    >
      <SkipToContent />
      <header className="sticky top-0 z-40 border-b bg-card/85 shadow-xs backdrop-blur-md">
        <div
          className={cn(
            "mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6",
            compact ? "py-2.5" : "py-3",
          )}
        >
          <div className="flex min-w-0 items-center gap-6">
            <Link
              to="/"
              className="flex shrink-0 items-center gap-2"
              aria-label={t("nav.homeLink")}
            >
              <BrandMark />
              <span className="hidden font-display text-lg font-bold tracking-tight min-[360px]:inline">
                CareConnect
              </span>
            </Link>
            <nav className="hidden items-center gap-1 lg:flex" aria-label={t("nav.primary")}>
              {NAV.map((item) => {
                const active = isActive(item.to, item.exact);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    data-tour-target={item.to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-highlight-soft text-highlight"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {t(item.label)}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-1 sm:gap-2">
            {/* Shown only to accounts with an active clinic membership (RLS-checked list). */}
            {!loading && user && !isLoadingClinicAccess && !clinicAccessError && activeClinic ? (
              <>
                <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
                  <Link to="/clinic">{t("nav.clinicPortal")}</Link>
                </Button>
                <Button asChild variant="ghost" size="icon" className="md:hidden">
                  <Link to="/clinic" aria-label={t("nav.clinicPortal")}>
                    <Building2 className="h-[1.2rem] w-[1.2rem]" aria-hidden />
                  </Link>
                </Button>
              </>
            ) : null}
            <LanguageSelect />
            <ThemeToggle />
            <div className="flex min-h-9 items-center">
              {loading ? (
                <span className="size-9 animate-pulse rounded-full bg-muted" aria-hidden />
              ) : user ? (
                <Link
                  to="/profile"
                  aria-label={t("nav.yourProfile")}
                  className="ms-1 rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <ProfileAvatar name={patient?.name || user.email || ""} className="h-9 w-9" />
                </Link>
              ) : (
                <div className="flex gap-2">
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/login">{t("nav.signIn")}</Link>
                  </Button>
                  <Button asChild size="sm" className="hidden sm:inline-flex">
                    <Link to="/login" search={{ signup: true }}>
                      {t("nav.signUp")}
                    </Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main
        ref={mainRef}
        id="main-content"
        tabIndex={-1}
        className={cn(
          "mx-auto w-full max-w-6xl flex-1 px-4 outline-none sm:px-6",
          compact ? "py-4 sm:py-6" : "py-6 sm:py-8",
        )}
      >
        {children}
        {pathname === "/" || pathname === "/discover" ? (
          <FirstVisitLanguage
            onDismiss={focusMain}
            onStartTour={() => setStartTour((value) => value + 1)}
          />
        ) : null}
      </main>

      <footer className="border-t">
        <div
          className={cn(
            "mx-auto flex max-w-6xl flex-col gap-1 px-4 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6",
            compact ? "py-3" : "py-5",
          )}
        >
          <p>{t("footer.copyright", { year: new Date().getFullYear() })}</p>
          <div className="flex flex-wrap items-center gap-x-3">
            <Link
              to="/providers"
              className="font-medium text-primary underline-offset-2 hover:underline"
            >
              {t("nav.forClinics")}
            </Link>
            {!isAdministration ? (
              <GuidedTour role="patient" compact startRequested={startTour} />
            ) : null}
          </div>
          <p>{t("footer.emergency")}</p>
        </div>
      </footer>

      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur lg:hidden",
          compact && "pb-[env(safe-area-inset-bottom)]",
        )}
        aria-label={t("nav.primaryMobile")}
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((item) => {
            const active = isActive(item.to, item.exact);
            return (
              <li key={item.to} className="min-w-0">
                <Link
                  to={item.to}
                  data-tour-target={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-md px-0.5 py-2.5 text-[11px] font-medium leading-tight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    active ? "text-highlight" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <item.icon className="h-5 w-5 shrink-0" aria-hidden />
                  <span className="max-w-full text-center [overflow-wrap:anywhere]">
                    {t(item.mobileLabel)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

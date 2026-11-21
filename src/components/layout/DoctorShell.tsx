import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarClock,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  ShieldAlert,
  UserRound,
} from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import { ErrorState, PageLoader } from "@/components/common";
import { LanguageSelect } from "@/components/LanguageSelect";
import { GuidedTour } from "@/components/GuidedTour";
import { RoleTourOffer } from "@/components/RoleTourOffer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useFocusMainOnNavigate } from "@/hooks/useFocusMainOnNavigate";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useAuth } from "@/lib/supabase/auth";
import { useMyDoctor, useMyDoctorApplications, type MyDoctor } from "@/lib/supabase/doctor";
import { describeDataError, isNotDeployed } from "@/lib/supabase/errors";
import { cn } from "@/lib/utils";
import { BrandMark, SkipToContent } from "@/components/BrandMark";

const NAV: {
  to:
    | "/doctor"
    | "/doctor/appointments"
    | "/doctor/schedule"
    | "/doctor/messages"
    | "/doctor/profile";
  label: MessageKey;
  icon: typeof UserRound;
  exact?: boolean;
}[] = [
  { to: "/doctor", label: "doctorNav.dashboard", icon: LayoutDashboard, exact: true },
  { to: "/doctor/appointments", label: "doctorNav.appointments", icon: CalendarDays },
  { to: "/doctor/schedule", label: "doctorNav.schedule", icon: CalendarClock },
  { to: "/doctor/messages", label: "doctorNav.messages", icon: MessageSquare },
  { to: "/doctor/profile", label: "doctorNav.profile", icon: UserRound },
];

/**
 * Layout and access gate for the doctor portal. Signed-out visitors go to /doctor/login; a signed-in
 * account opens the portal only when CareConnect has linked it to a doctor profile (RLS-checked).
 */
export function DoctorShell({
  title,
  description,
  applicationProgress,
  children,
}: {
  title: string;
  description?: string;
  applicationProgress?: (applications: ReturnType<typeof useMyDoctorApplications>) => ReactNode;
  children: (doctor: MyDoctor, tourOffer: ReactNode) => ReactNode;
}) {
  const { loading, user } = useProtectedRoute("/doctor/login");
  const { signOut } = useAuth();
  const doctor = useMyDoctor(user?.id);
  const mainRef = useRef<HTMLElement>(null);
  const [startTour, setStartTour] = useState(0);
  const { t, fmt } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useFocusMainOnNavigate(mainRef, !loading && !!user && !!doctor.data);
  const applications = useMyDoctorApplications(
    applicationProgress && doctor.data === null ? user?.id : undefined,
  );

  if (loading || !user || doctor.isLoading || applications.isLoading) {
    return (
      <div className="min-h-screen p-6">
        <PageLoader
          label={!loading && !user ? t("common.redirectingToSignIn") : t("doctorShell.loading")}
        />
      </div>
    );
  }

  if (doctor.error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="w-full max-w-md">
          <ErrorState
            title={t("portal.accessError")}
            message={t(describeDataError(doctor.error))}
            onRetry={() => void doctor.refetch()}
          />
        </div>
      </div>
    );
  }

  if (!doctor.data) {
    if (applications.error && !isNotDeployed(applications.error)) {
      return (
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-md">
            <ErrorState
              title={t("portal.accessError")}
              message={t(describeDataError(applications.error))}
              onRetry={() => void applications.refetch()}
            />
          </div>
        </div>
      );
    }
    if (applicationProgress && !applications.error && applications.data?.length) {
      return (
        <main id="main-content" className="mx-auto w-full max-w-2xl space-y-4 px-4 py-6 sm:px-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h1 className="font-display text-2xl font-bold">{title}</h1>
            <div className="flex items-center gap-2">
              <LanguageSelect />
              <ThemeToggle />
            </div>
          </div>
          <RoleTourOffer role="doctor" onStart={() => setStartTour((value) => value + 1)} />
          {applicationProgress(applications)}
          <div className="flex flex-wrap gap-2">
            <GuidedTour role="doctor" startRequested={startTour} />
            <Button asChild variant="outline">
              <Link to="/">{t("portal.toPatientApp")}</Link>
            </Button>
            <Button variant="ghost" onClick={() => void signOut()}>
              {t("common.signOut")}
            </Button>
          </div>
        </main>
      );
    }
    return (
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <ShieldAlert className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="mb-2 font-display text-2xl font-bold">{t("portal.doctor.noAccessTitle")}</h1>
        <p className="mb-6 max-w-md text-muted-foreground">
          {t("portal.doctor.noAccessBody", { email: user.email ?? "" })}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/">{t("portal.toPatientApp")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/doctor/signup">{t("portal.doctor.register")}</Link>
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            {t("common.signOut")}
          </Button>
        </div>
      </div>
    );
  }

  const me = doctor.data;
  const isActive = (to: string, exact?: boolean) =>
    exact
      ? pathname === to || pathname === to + "/"
      : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <div className="min-h-screen">
      <SkipToContent />
      <div className="mx-auto flex max-w-[1500px]">
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col overflow-y-auto border-e bg-sidebar px-4 py-5 lg:flex xl:w-64">
          <Link to="/doctor" className="mb-6 flex items-center gap-2 px-2">
            <BrandMark />
            <span className="min-w-0">
              <span className="block font-display text-sm font-bold">CareConnect</span>
              <span className="block truncate text-xs font-medium text-muted-foreground">
                {t("portal.doctor.name")}
              </span>
            </span>
          </Link>
          <nav className="flex flex-1 flex-col gap-1" aria-label={t("doctorNav.label")}>
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                data-tour-target={item.to}
                aria-current={isActive(item.to, item.exact) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                  isActive(item.to, item.exact)
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 [overflow-wrap:anywhere]">{t(item.label)}</span>
              </Link>
            ))}
          </nav>
          <div className="mt-4 rounded-xl border bg-card p-3">
            <p className="truncate text-sm font-semibold" dir="auto">
              {me.name}
            </p>
            <p className="truncate text-xs text-primary">{fmt.specialty(me.specialtyId)}</p>
            <Button asChild variant="outline" size="sm" className="mt-3 w-full">
              <Link to="/">{t("clinicShell.switchToPatient")}</Link>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full"
              onClick={() => void signOut()}
            >
              <LogOut aria-hidden />
              {t("common.signOut")}
            </Button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="z-30 border-b bg-card/95 px-4 py-3 sm:px-6 lg:sticky lg:top-0 lg:backdrop-blur">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
              <div className="min-w-0">
                <h1 className="portal-title">{title}</h1>
                <p
                  className="text-xs text-muted-foreground [overflow-wrap:anywhere] lg:hidden"
                  dir="auto"
                >
                  {me.name}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <GuidedTour role="doctor" iconOnly startRequested={startTour} />
                <LanguageSelect />
                <ThemeToggle />
              </div>
            </div>
            {description ? <p className="page-description mt-1.5">{description}</p> : null}
            <nav
              className="mt-3 flex flex-wrap gap-1.5 border-t pt-2.5 lg:hidden"
              aria-label={t("doctorNav.mobileLabel")}
            >
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  data-tour-target={item.to}
                  aria-current={isActive(item.to, item.exact) ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-xl px-2.5 text-xs font-medium [overflow-wrap:anywhere] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    isActive(item.to, item.exact)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <item.icon className="size-4 shrink-0" aria-hidden />
                  {t(item.label)}
                </Link>
              ))}
              <div className="flex w-full flex-wrap gap-1.5 border-t pt-1.5">
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-auto min-h-10 max-w-full whitespace-normal"
                >
                  <Link to="/">{t("clinicShell.patientApp")}</Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-auto min-h-10 max-w-full whitespace-normal"
                  onClick={() => void signOut()}
                >
                  <LogOut aria-hidden />
                  {t("common.signOut")}
                </Button>
              </div>
            </nav>
          </header>
          <main
            ref={mainRef}
            id="main-content"
            tabIndex={-1}
            className="mx-auto w-full max-w-7xl px-4 py-6 outline-none sm:px-6 xl:px-9"
          >
            {children(
              me,
              pathname === "/doctor" || pathname === "/doctor/" ? (
                <RoleTourOffer role="doctor" onStart={() => setStartTour((value) => value + 1)} />
              ) : null,
            )}
          </main>
        </div>
      </div>
    </div>
  );
}

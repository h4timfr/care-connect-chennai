import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarClock,
  CalendarDays,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  ShieldAlert,
  Stethoscope,
  UserRound,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
import { ErrorState, PageLoader } from "@/components/common";
import { LanguageSelect } from "@/components/LanguageSelect";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";
import { useFocusMainOnNavigate } from "@/hooks/useFocusMainOnNavigate";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useAuth } from "@/lib/supabase/auth";
import { useMyDoctor, type MyDoctor } from "@/lib/supabase/doctor";
import { describeDataError } from "@/lib/supabase/errors";
import { cn } from "@/lib/utils";

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
  children,
}: {
  title: string;
  description?: string;
  children: (doctor: MyDoctor) => ReactNode;
}) {
  const { loading, user } = useProtectedRoute("/doctor/login");
  const { signOut } = useAuth();
  const doctor = useMyDoctor(user?.id);
  const mainRef = useRef<HTMLElement>(null);
  const { t, fmt } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useFocusMainOnNavigate(mainRef, !loading && !!user && !!doctor.data);

  if (loading || !user || doctor.isLoading) {
    return (
      <div className="min-h-screen bg-surface p-6">
        <PageLoader
          label={!loading && !user ? t("common.redirectingToSignIn") : t("doctorShell.loading")}
        />
      </div>
    );
  }

  if (doctor.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6">
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
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-6 text-center">
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
    exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto flex max-w-[1500px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e bg-sidebar px-4 py-5 lg:flex">
          <Link to="/doctor" className="mb-6 flex items-center gap-2 px-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-primary to-highlight text-primary-foreground shadow-sm">
              <Stethoscope className="h-4.5 w-4.5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-sm font-bold">CareConnect</span>
              <span className="block truncate text-xs font-medium text-primary">
                {t("portal.doctor.name")}
              </span>
            </span>
          </Link>
          <nav className="flex flex-1 flex-col gap-1" aria-label={t("doctorNav.label")}>
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                aria-current={isActive(item.to, item.exact) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive(item.to, item.exact)
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{t(item.label)}</span>
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
          <header className="sticky top-0 z-30 border-b bg-card/90 px-4 py-3 backdrop-blur sm:px-6">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <h1 className="truncate font-display text-lg font-bold sm:text-xl">{title}</h1>
                <p className="truncate text-xs text-muted-foreground lg:hidden" dir="auto">
                  {me.name} · {t("portal.doctor.name")}
                </p>
                {description ? (
                  <p className="truncate text-sm text-muted-foreground">{description}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <LanguageSelect />
                <ThemeToggle />
              </div>
            </div>
            <nav
              className="-mx-1 mt-3 flex gap-1 overflow-x-auto pb-1 lg:hidden"
              aria-label={t("doctorNav.mobileLabel")}
            >
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  aria-current={isActive(item.to, item.exact) ? "page" : undefined}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive(item.to, item.exact)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {t(item.label)}
                </Link>
              ))}
              <Link
                to="/"
                className="shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium text-muted-foreground"
              >
                {t("clinicShell.patientApp")}
              </Link>
            </nav>
          </header>
          <main
            ref={mainRef}
            id="main-content"
            tabIndex={-1}
            className="px-4 py-6 outline-none sm:px-6"
          >
            {children(me)}
          </main>
        </div>
      </div>
    </div>
  );
}

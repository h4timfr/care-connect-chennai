import { Link, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  CalendarRange,
  LayoutDashboard,
  MessageSquare,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";
import { useRef, type ReactNode } from "react";
import { useFocusMainOnNavigate } from "@/hooks/useFocusMainOnNavigate";
import { cn } from "@/lib/utils";
import { LanguageSelect } from "@/components/LanguageSelect";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ErrorState, PageLoader } from "@/components/common";
import { describeDataError } from "@/lib/supabase/errors";
import { useApp } from "@/lib/store";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { Button } from "@/components/ui/button";
import type { MemberClinic } from "@/lib/supabase/queries";

const NAV: {
  to:
    | "/clinic"
    | "/clinic/appointments"
    | "/clinic/calendar"
    | "/clinic/doctors"
    | "/clinic/patients"
    | "/clinic/messages"
    | "/clinic/profile";
  label: MessageKey;
  icon: typeof Users;
  exact?: boolean;
}[] = [
  { to: "/clinic", label: "clinicNav.dashboard", icon: LayoutDashboard, exact: true },
  { to: "/clinic/appointments", label: "clinicNav.appointments", icon: CalendarDays },
  { to: "/clinic/calendar", label: "clinicNav.calendar", icon: CalendarRange },
  { to: "/clinic/doctors", label: "clinicNav.doctors", icon: UserRound },
  { to: "/clinic/patients", label: "clinicNav.patients", icon: Users },
  { to: "/clinic/messages", label: "clinicNav.messages", icon: MessageSquare },
  { to: "/clinic/profile", label: "clinicNav.profile", icon: Building2 },
];

function roleKey(role: MemberClinic["memberRole"]): MessageKey {
  if (role === "clinic_admin" || role === "clinic_staff" || role === "doctor") {
    return `clinicShell.role.${role}`;
  }
  return "clinicShell.role.other";
}

export function ClinicShell({
  title,
  description,
  actions,
  children,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  const { loading, user } = useProtectedRoute();
  const mainRef = useRef<HTMLElement>(null);
  const { t } = useI18n();
  const {
    activeClinic,
    memberClinics,
    setActiveClinicId,
    isLoadingClinicAccess,
    clinicAccessError,
    refetchClinicAccess,
  } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  useFocusMainOnNavigate(
    mainRef,
    !loading && !!user && !isLoadingClinicAccess && !clinicAccessError && !!activeClinic,
  );

  if (loading || !user || isLoadingClinicAccess) {
    return (
      <div className="min-h-screen bg-surface p-6">
        <PageLoader
          label={!loading && !user ? t("common.redirectingToSignIn") : t("clinicShell.loading")}
        />
      </div>
    );
  }

  // A failed membership lookup is not the same as having no membership.
  if (clinicAccessError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-6">
        <div className="w-full max-w-md">
          <ErrorState
            title={t("clinicShell.accessError")}
            message={t(describeDataError(clinicAccessError))}
            onRetry={refetchClinicAccess}
          />
        </div>
      </div>
    );
  }

  if (!activeClinic) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-6 text-center">
        <Stethoscope className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="mb-2 font-display text-2xl font-bold">{t("clinicShell.noAccessTitle")}</h1>
        <p className="mb-6 max-w-md text-muted-foreground">{t("clinicShell.noAccessBody")}</p>
        <Button asChild>
          <Link to="/">{t("clinicShell.goToApp")}</Link>
        </Button>
      </div>
    );
  }
  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
  const role = t(roleKey(activeClinic.memberRole));

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto flex max-w-[1500px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-e bg-sidebar px-4 py-5 lg:flex">
          <Link to="/clinic" className="mb-6 flex items-center gap-2 px-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Stethoscope className="h-4.5 w-4.5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-sm font-bold">CareConnect</span>
              <span className="block truncate text-xs text-muted-foreground">
                {t("clinicShell.portal")}
              </span>
            </span>
          </Link>
          <nav className="flex flex-1 flex-col gap-1" aria-label={t("clinicNav.label")}>
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
            {memberClinics.length > 1 ? (
              <ClinicPicker
                id="clinic-picker-sidebar"
                clinics={memberClinics}
                value={activeClinic.id}
                onChange={setActiveClinicId}
              />
            ) : (
              <p className="truncate text-sm font-semibold">{activeClinic.name}</p>
            )}
            <p className="truncate text-xs text-muted-foreground">
              {[activeClinic.area, t("common.chennai")].filter(Boolean).join(", ")}
            </p>
            <p className="mt-1 text-xs font-medium text-primary" data-testid="clinic-role">
              {role}
            </p>
            <Button asChild variant="outline" size="sm" className="mt-3 w-full">
              <Link to="/">{t("clinicShell.switchToPatient")}</Link>
            </Button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b bg-card/90 px-4 py-3 backdrop-blur sm:px-6">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <h1 className="truncate font-display text-lg font-bold sm:text-xl">{title}</h1>
                {memberClinics.length > 1 ? (
                  <div className="mt-1 max-w-xs lg:hidden">
                    <ClinicPicker
                      id="clinic-picker-header"
                      clinics={memberClinics}
                      value={activeClinic.id}
                      onChange={setActiveClinicId}
                    />
                  </div>
                ) : (
                  <p className="truncate text-xs text-muted-foreground lg:hidden">
                    {activeClinic.name} · {role}
                  </p>
                )}
                {description ? (
                  <p className="truncate text-sm text-muted-foreground">{description}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <LanguageSelect />
                <ThemeToggle />
                {actions}
              </div>
            </div>
            <nav
              className="-mx-1 mt-3 flex gap-1 overflow-x-auto pb-1 lg:hidden"
              aria-label={t("clinicNav.mobileLabel")}
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
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}

function ClinicPicker({
  id,
  clinics,
  value,
  onChange,
}: {
  id: string;
  clinics: { id: string; name: string }[];
  value: string;
  onChange: (clinicId: string) => void;
}) {
  const { t } = useI18n();
  return (
    <div>
      <label htmlFor={id} className="text-xs text-muted-foreground">
        {t("clinicShell.clinic")}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5 h-8 w-full truncate rounded-md border bg-background px-2 text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {clinics.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  );
}

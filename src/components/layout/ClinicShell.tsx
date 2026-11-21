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
import { useRef, useState, type ReactNode } from "react";
import { useFocusMainOnNavigate } from "@/hooks/useFocusMainOnNavigate";
import { cn } from "@/lib/utils";
import { LanguageSelect } from "@/components/LanguageSelect";
import { GuidedTour } from "@/components/GuidedTour";
import { RoleTourOffer } from "@/components/RoleTourOffer";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ErrorState, PageLoader } from "@/components/common";
import { describeDataError } from "@/lib/supabase/errors";
import { useApp } from "@/lib/store";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { useAuth } from "@/lib/supabase/auth";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import type { MemberClinic } from "@/lib/supabase/queries";
import { BrandMark, SkipToContent } from "@/components/BrandMark";

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
  // Signed-out visitors go to the clinic portal sign-in; membership is still checked below.
  const { loading, user } = useProtectedRoute("/clinic/login");
  const { signOut } = useAuth();
  const mainRef = useRef<HTMLElement>(null);
  const [startTour, setStartTour] = useState(0);
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
      <div className="min-h-screen p-6">
        <PageLoader
          label={!loading && !user ? t("common.redirectingToSignIn") : t("clinicShell.loading")}
        />
      </div>
    );
  }

  // A failed membership lookup is not the same as having no membership.
  if (clinicAccessError) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
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
      <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
        <Stethoscope className="mb-4 h-12 w-12 text-muted-foreground" aria-hidden />
        <h1 className="mb-2 font-display text-2xl font-bold">{t("portal.clinic.noAccessTitle")}</h1>
        <p className="mb-6 max-w-md text-muted-foreground">
          {t("portal.clinic.noAccessBody", { email: user.email ?? "" })}
        </p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button asChild>
            <Link to="/">{t("clinicShell.goToApp")}</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/clinic/signup">{t("portal.clinic.register")}</Link>
          </Button>
          <Button variant="ghost" onClick={() => void signOut()}>
            {t("common.signOut")}
          </Button>
        </div>
      </div>
    );
  }
  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);
  const role = t(roleKey(activeClinic.memberRole));

  return (
    <div className="min-h-screen">
      <SkipToContent />
      <div className="mx-auto flex max-w-[1600px]">
        <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col border-e bg-sidebar px-4 py-5 lg:flex xl:w-64">
          <Link
            to="/clinic"
            className="mb-6 flex items-center gap-2 rounded-lg px-2 py-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <BrandMark />
            <span className="min-w-0">
              <span className="block font-display text-sm font-bold">CareConnect</span>
              <span className="block truncate text-xs text-muted-foreground">
                {t("clinicShell.portal")}
              </span>
            </span>
          </Link>
          <nav
            className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
            aria-label={t("clinicNav.label")}
          >
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                data-tour-target={item.to}
                aria-current={isActive(item.to, item.exact) ? "page" : undefined}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
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
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 w-full"
              onClick={() => void signOut()}
            >
              {t("common.signOut")}
            </Button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="relative z-30 border-b bg-card/95 px-4 py-3 sm:px-6 lg:sticky lg:top-0">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-3 gap-y-2">
              <div className="min-w-0">
                <h1 className="portal-title">{title}</h1>
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
                  <p className="text-xs text-muted-foreground [overflow-wrap:anywhere] lg:hidden">
                    {activeClinic.name} · {role}
                  </p>
                )}
                {description ? <p className="page-description mt-1.5">{description}</p> : null}
              </div>
              <div className="flex shrink-0 items-center gap-1 sm:gap-2">
                <GuidedTour role="clinic" iconOnly startRequested={startTour} />
                <LanguageSelect />
                <ThemeToggle />
              </div>
              {actions ? (
                <div className="col-span-2 flex min-w-0 justify-start sm:justify-end">
                  {actions}
                </div>
              ) : null}
            </div>
            <nav
              className="mt-3 flex flex-wrap gap-1.5 border-t pt-2.5 lg:hidden"
              aria-label={t("clinicNav.mobileLabel")}
            >
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  data-tour-target={item.to}
                  aria-current={isActive(item.to, item.exact) ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-10 max-w-full items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-xs font-medium [overflow-wrap:anywhere] transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    isActive(item.to, item.exact)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  <item.icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
                  <span className="min-w-0">{t(item.label)}</span>
                </Link>
              ))}
              <Link
                to="/"
                className="inline-flex min-h-9 max-w-full items-center rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {t("clinicShell.patientApp")}
              </Link>
              <button
                type="button"
                onClick={() => void signOut()}
                className="inline-flex min-h-9 max-w-full items-center rounded-lg border px-2.5 py-1.5 text-xs font-medium text-muted-foreground [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                {t("common.signOut")}
              </button>
            </nav>
          </header>
          <main
            ref={mainRef}
            id="main-content"
            tabIndex={-1}
            className="mx-auto min-w-0 max-w-screen-2xl px-4 py-4 outline-none sm:px-6 sm:py-6"
          >
            {pathname === "/clinic" || pathname === "/clinic/" ? (
              <RoleTourOffer role="clinic" onStart={() => setStartTour((value) => value + 1)} />
            ) : null}
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
      <NativeSelect
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-0.5"
        selectClassName="h-9 font-semibold md:text-sm"
      >
        {clinics.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </NativeSelect>
    </div>
  );
}

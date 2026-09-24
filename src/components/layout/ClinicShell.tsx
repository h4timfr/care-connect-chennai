import { Link, useRouterState } from "@tanstack/react-router";
import {
  Building2,
  CalendarDays,
  CalendarRange,
  LayoutDashboard,
  MessageSquare,
  Settings,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/clinic", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/clinic/appointments", label: "Appointments", icon: CalendarDays },
  { to: "/clinic/calendar", label: "Calendar", icon: CalendarRange },
  { to: "/clinic/doctors", label: "Doctors", icon: UserRound },
  { to: "/clinic/patients", label: "Patients", icon: Users },
  { to: "/clinic/messages", label: "Messages", icon: MessageSquare },
  { to: "/clinic/profile", label: "Clinic Profile", icon: Building2 },
  { to: "/clinic/settings", label: "Settings", icon: Settings },
] as const;

import { useProtectedRoute } from "@/hooks/useProtectedRoute";

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
  const { activeClinic, conversations } = useApp();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-6 text-center">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  if (!user) return null;

  if (!activeClinic) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-surface p-6 text-center">
        <Stethoscope className="mb-4 h-12 w-12 text-muted-foreground" />
        <h1 className="mb-2 font-display text-2xl font-bold">No Authorized Clinic</h1>
        <p className="mb-6 max-w-md text-muted-foreground">
          You don't have access to any clinic. If you believe this is an error, please contact your
          administrator.
        </p>
        <Button asChild>
          <Link to="/">Return to App</Link>
        </Button>
      </div>
    );
  }
  const unread = conversations
    .filter((c) => c.clinicId === activeClinic.id)
    .reduce((n, c) => n + c.unreadForClinic, 0);

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <div className="min-h-screen bg-surface">
      <div className="mx-auto flex max-w-[1500px]">
        <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-r bg-sidebar px-4 py-5 lg:flex">
          <Link to="/clinic" className="mb-6 flex items-center gap-2 px-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Stethoscope className="h-4.5 w-4.5" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block font-display text-sm font-bold">CareConnect</span>
              <span className="block truncate text-xs text-muted-foreground">Clinic portal</span>
            </span>
          </Link>
          <nav className="flex flex-1 flex-col gap-1" aria-label="Clinic">
            {NAV.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  isActive(item.to, "exact" in item ? item.exact : false)
                    ? "bg-primary-soft text-primary"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4 shrink-0" aria-hidden />
                <span className="min-w-0 truncate">{item.label}</span>
                {item.to === "/clinic/messages" && unread > 0 ? (
                  <span className="ml-auto rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                    {unread}
                  </span>
                ) : null}
              </Link>
            ))}
          </nav>
          <div className="mt-4 rounded-xl border bg-card p-3">
            <p className="truncate text-sm font-semibold">{activeClinic.name}</p>
            <p className="truncate text-xs text-muted-foreground">{activeClinic.area}, Chennai</p>
            <Button asChild variant="outline" size="sm" className="mt-3 w-full">
              <Link to="/">Switch to patient app</Link>
            </Button>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          <header className="sticky top-0 z-30 border-b bg-card/90 px-4 py-3 backdrop-blur sm:px-6">
            <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
              <div className="min-w-0">
                <h1 className="truncate font-display text-lg font-bold sm:text-xl">{title}</h1>
                {description ? (
                  <p className="truncate text-sm text-muted-foreground">{description}</p>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <LanguageToggle />
                <ThemeToggle />
                {actions}
              </div>
            </div>
            <nav
              className="mt-3 -mx-1 flex gap-1 overflow-x-auto pb-1 lg:hidden"
              aria-label="Clinic mobile"
            >
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
                    isActive(item.to, "exact" in item ? item.exact : false)
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {item.label}
                </Link>
              ))}
            </nav>
          </header>
          <main className="px-4 py-6 sm:px-6">{children}</main>
        </div>
      </div>
    </div>
  );
}

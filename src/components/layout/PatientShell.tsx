import { Link, useRouterState } from "@tanstack/react-router";
import {
  CalendarDays,
  Compass,
  Home,
  MessageCircle,
  Sparkles,
  Stethoscope,
  User,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { Initials } from "@/components/common";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Home", mobileLabel: "Home", icon: Home, exact: true },
  { to: "/discover", label: "Find Doctors", mobileLabel: "Discover", icon: Compass },
  { to: "/appointments", label: "Appointments", mobileLabel: "Visits", icon: CalendarDays },
  { to: "/messages", label: "Messages", mobileLabel: "Messages", icon: MessageCircle },
  { to: "/profile", label: "Profile", mobileLabel: "Profile", icon: User },
] as const;

import { useAuth } from "@/lib/supabase/auth";

export function PatientShell({ children }: { children: ReactNode }) {
  const { patient, conversations } = useApp();
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unread = conversations
    .filter((c) => c.patientId === patient?.id)
    .reduce((n, c) => n + c.unreadForPatient, 0);

  const isActive = (to: string, exact?: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0">
      <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto grid max-w-6xl grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-6">
            <Link to="/" className="flex shrink-0 items-center gap-2">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
                <Stethoscope className="h-4.5 w-4.5" aria-hidden />
              </span>
              <span className="font-display text-lg font-bold tracking-tight">CareConnect</span>
            </Link>
            <nav className="hidden items-center gap-1 md:flex" aria-label="Primary">
              {NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                    isActive(item.to, "exact" in item ? item.exact : false)
                      ? "bg-primary-soft text-primary"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {item.label}
                  {item.to === "/messages" && unread > 0 ? (
                    <span className="ml-1.5 rounded-full bg-primary px-1.5 py-0.5 text-[10px] text-primary-foreground">
                      {unread}
                    </span>
                  ) : null}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="hidden sm:inline-flex">
              <Link to="/assistant">
                <Sparkles className="h-4 w-4" aria-hidden />
                Assistant
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="hidden lg:inline-flex">
              <Link to="/clinic">Clinic portal</Link>
            </Button>
            <div className="flex shrink-0 items-center gap-3">
              <LanguageToggle />
              <ThemeToggle />
              {loading ? (
                <div className="h-9 w-9 animate-pulse rounded-full bg-muted" />
              ) : user ? (
                <Link to="/profile" aria-label="Your profile">
                  <Initials name={patient?.name ?? ""} className="h-9 w-9" />
                </Link>
              ) : (
                <div className="flex gap-2">
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/login">Sign In</Link>
                  </Button>
                  <Button asChild size="sm">
                    <Link to="/login" search={{ signup: true } as any}>Sign Up</Link>
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur md:hidden"
        aria-label="Primary mobile"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((item) => {
            const active = isActive(item.to, "exact" in item ? item.exact : false);
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                >
                  <span className="relative">
                    <item.icon className="h-5 w-5" aria-hidden />
                    {item.to === "/messages" && unread > 0 ? (
                      <span className="absolute -right-1.5 -top-1 h-2 w-2 rounded-full bg-primary" />
                    ) : null}
                  </span>
                  {item.mobileLabel}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

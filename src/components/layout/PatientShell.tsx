import { Link, useRouterState } from "@tanstack/react-router";
import { CalendarDays, Compass, Home, MessageCircle, Stethoscope, User } from "lucide-react";
import { useRef, type ReactNode } from "react";
import { useFocusMainOnNavigate } from "@/hooks/useFocusMainOnNavigate";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth";
import { Initials } from "@/components/common";
import { ThemeToggle } from "@/components/ThemeToggle";
import { Button } from "@/components/ui/button";

const NAV = [
  { to: "/", label: "Home", mobileLabel: "Home", icon: Home, exact: true },
  { to: "/discover", label: "Find doctors", mobileLabel: "Discover", icon: Compass, exact: false },
  {
    to: "/appointments",
    label: "Appointments",
    mobileLabel: "Visits",
    icon: CalendarDays,
    exact: false,
  },
  {
    to: "/messages",
    label: "Messages",
    mobileLabel: "Messages",
    icon: MessageCircle,
    exact: false,
  },
  { to: "/profile", label: "Profile", mobileLabel: "Profile", icon: User, exact: false },
] as const;

export function PatientShell({ children }: { children: ReactNode }) {
  const mainRef = useRef<HTMLElement>(null);
  useFocusMainOnNavigate(mainRef);
  const { patient, activeClinic } = useApp();
  const { user, loading } = useAuth();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const isActive = (to: string, exact: boolean) =>
    exact ? pathname === to : pathname === to || pathname.startsWith(`${to}/`);

  return (
    <div className="flex min-h-screen flex-col bg-background pb-20 lg:pb-0">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-3 focus:z-50 focus:rounded-lg focus:bg-card focus:px-3 focus:py-2 focus:text-sm focus:shadow-pop"
      >
        Skip to content
      </a>
      <header className="sticky top-0 z-40 border-b bg-card/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-6">
            <Link to="/" className="flex shrink-0 items-center gap-2" aria-label="CareConnect home">
              <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground">
                <Stethoscope className="h-4.5 w-4.5" aria-hidden />
              </span>
              <span className="font-display text-lg font-bold tracking-tight">CareConnect</span>
            </Link>
            <nav className="hidden items-center gap-1 lg:flex" aria-label="Primary">
              {NAV.map((item) => {
                const active = isActive(item.to, item.exact);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active
                        ? "bg-primary-soft text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {activeClinic ? (
              <Button asChild variant="outline" size="sm" className="hidden md:inline-flex">
                <Link to="/clinic">Clinic portal</Link>
              </Button>
            ) : null}
            <ThemeToggle />
            {loading ? (
              <div className="h-9 w-9 animate-pulse rounded-full bg-muted" aria-hidden />
            ) : user ? (
              <Link
                to="/profile"
                aria-label="Your profile"
                className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Initials name={patient?.name || user.email || ""} className="h-9 w-9" />
              </Link>
            ) : (
              <div className="flex gap-2">
                <Button asChild variant="ghost" size="sm">
                  <Link to="/login">Sign in</Link>
                </Button>
                <Button asChild size="sm" className="hidden sm:inline-flex">
                  <Link to="/login" search={{ signup: true }}>
                    Sign up
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main
        ref={mainRef}
        id="main-content"
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 outline-none sm:px-6 sm:py-8"
      >
        {children}
      </main>

      <footer className="border-t">
        <div className="mx-auto flex max-w-6xl flex-col gap-1 px-4 py-5 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>© {new Date().getFullYear()} CareConnect</p>
          <p>CareConnect is for booking and clinic messages. In a medical emergency, call 108.</p>
        </div>
      </footer>

      <nav
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 backdrop-blur lg:hidden"
        aria-label="Primary mobile"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((item) => {
            const active = isActive(item.to, item.exact);
            return (
              <li key={item.to}>
                <Link
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span className="relative">
                    <item.icon className="h-5 w-5" aria-hidden />
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

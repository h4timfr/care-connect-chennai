import { Link } from "@tanstack/react-router";
import {
  Baby,
  Bone,
  Brain,
  Ear,
  Eye,
  Heart,
  HeartPulse,
  Info,
  MapPin,
  Smile,
  Sparkles,
  Star,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AppointmentStatus } from "@/lib/types";

const ICONS: Record<string, LucideIcon> = {
  Baby,
  Bone,
  Sparkles,
  Stethoscope,
  HeartPulse,
  Ear,
  Heart,
  Smile,
  Eye,
  Brain,
};

export function SpecialtyIcon({ icon, className }: { icon: string; className?: string }) {
  const Icon = ICONS[icon] ?? Stethoscope;
  return <Icon className={cn("h-5 w-5", className)} aria-hidden />;
}

export function Rating({ value, count }: { value: number; count: number }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />
      <span className="font-medium text-foreground">{value.toFixed(1)}</span>
      <span>· {count} reviews</span>
    </span>
  );
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const initials = name
    .replace(/^Dr\.?\s*/i, "")
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("")
    .toUpperCase();
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-full bg-primary-soft font-display text-sm font-semibold text-primary",
        className,
      )}
      aria-hidden
    >
      {initials}
    </span>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
      <div className="min-w-0">
        <h2 className="truncate text-lg font-semibold sm:text-xl">{title}</h2>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>
      {action}
    </div>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface-card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const map: Record<AppointmentStatus, string> = {
    pending: "bg-warning/15 text-warning-foreground",
    confirmed: "bg-success/15 text-success",
    arrived: "bg-info/15 text-info",
    completed: "bg-muted text-muted-foreground",
    cancelled: "bg-destructive/12 text-destructive",
  };
  const label: Record<AppointmentStatus, string> = {
    pending: "Pending",
    confirmed: "Confirmed",
    arrived: "Arrived",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
        map[status],
      )}
    >
      {label[status]}
    </span>
  );
}

export function InfoNotice({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground">
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <p className="min-w-0">{children}</p>
    </div>
  );
}

export function DemoBanner() {
  return (
    <InfoNotice>
      Demo prototype — all clinics, doctors, reviews and messages shown are fictional sample data.
    </InfoNotice>
  );
}

export function MapPlaceholder({
  area,
  address,
  className,
}: {
  area: string;
  address?: string;
  className?: string;
}) {
  return (
    <div
      className={cn("relative overflow-hidden rounded-xl border bg-surface", className ?? "h-44")}
      role="img"
      aria-label={`Map placeholder for ${area}`}
    >
      <div
        className="absolute inset-0 opacity-70"
        style={{
          backgroundImage:
            "linear-gradient(to right, var(--color-border) 1px, transparent 1px), linear-gradient(to bottom, var(--color-border) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="absolute inset-0 grid place-items-center">
        <div className="flex items-center gap-2 rounded-full bg-card px-3 py-1.5 text-sm shadow-sm">
          <MapPin className="h-4 w-4 text-primary" aria-hidden />
          <span className="font-medium">{area}</span>
        </div>
      </div>
      {address ? (
        <p className="absolute inset-x-0 bottom-0 truncate bg-card/90 px-3 py-2 text-xs text-muted-foreground">
          {address}
        </p>
      ) : null}
      <span className="absolute right-2 top-2 rounded bg-card/90 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        Map preview
      </span>
    </div>
  );
}

export function BackLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1 text-sm text-muted-foreground transition-colors hover:text-foreground"
    >
      ← {label}
    </Link>
  );
}

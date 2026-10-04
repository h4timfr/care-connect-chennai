import {
  AlertTriangle,
  Baby,
  Bone,
  Brain,
  Ear,
  Eye,
  Heart,
  HeartPulse,
  Info,
  Loader2,
  Smile,
  Sparkles,
  Star,
  Stethoscope,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { AppointmentStatus } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

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

/**
 * Stored rating summary. Hidden when there are no reviews, and for sample listings: their
 * seeded ratings have no reviews behind them and must not read as real patient feedback.
 */
export function Rating({
  value,
  count,
  sample,
}: {
  value: number;
  count: number;
  sample: boolean;
}) {
  if (sample || count <= 0) return null;
  return (
    <span className="inline-flex items-center gap-1 text-sm text-muted-foreground">
      <Star className="h-3.5 w-3.5 fill-warning text-warning" aria-hidden />
      <span className="font-medium text-foreground">{value.toFixed(1)}</span>
      <span>
        · {count} {count === 1 ? "review" : "reviews"}
      </span>
    </span>
  );
}

export function Initials({ name, className }: { name: string; className?: string }) {
  const initials = name
    .replace(/^Dr\.?\s*/i, "")
    .split(/\s+/)
    .filter(Boolean)
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
      {initials || <Stethoscope className="h-1/2 w-1/2" />}
    </span>
  );
}

/**
 * Shown on doctor and clinic listings the database marks as sample content (`is_demo`), so
 * patients are never led to believe a sample listing is a real, verified provider.
 */
export function SampleBadge({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border border-warning/40 bg-warning/10 px-2 py-0.5 text-[11px] font-medium text-warning-foreground dark:text-warning",
        className,
      )}
      title="This listing is marked as sample content in CareConnect's directory."
    >
      Sample listing
    </span>
  );
}

export function SectionHeader({
  title,
  subtitle,
  action,
  id,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  id?: string;
}) {
  return (
    <div className="mb-4 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
      <div className="min-w-0">
        <h2 id={id} className="truncate text-lg font-semibold sm:text-xl">
          {title}
        </h2>
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
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="surface-card flex flex-col items-center gap-3 px-6 py-12 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-muted text-muted-foreground">
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <div>
        <h3 className="font-semibold">{title}</h3>
        {description ? (
          <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {action}
    </div>
  );
}

/** A failed load, as opposed to an empty result. */
export function ErrorState({
  title,
  message,
  onRetry,
}: {
  title: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="surface-card flex flex-col items-center gap-3 border-destructive/30 px-6 py-12 text-center"
    >
      <span className="grid h-12 w-12 place-items-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-5 w-5" aria-hidden />
      </span>
      <div>
        <h3 className="font-semibold">{title}</h3>
        <p className="mx-auto mt-1 max-w-sm text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry}>
          Try again
        </Button>
      ) : null}
    </div>
  );
}

export function PageLoader({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-muted-foreground"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
      {label}
    </div>
  );
}

export function CardGridSkeleton({ count = 4, label }: { count?: number; label: string }) {
  return (
    <div role="status" aria-label={label} className="grid gap-4 md:grid-cols-2">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="surface-card space-y-3 p-5">
          <div className="flex gap-3">
            <Skeleton className="h-12 w-12 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </div>
          <Skeleton className="h-16 w-full" />
        </div>
      ))}
    </div>
  );
}

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  const map: Record<AppointmentStatus, string> = {
    pending: "bg-warning/15 text-warning-foreground dark:text-warning",
    confirmed: "bg-success/15 text-success",
    arrived: "bg-info/15 text-info",
    completed: "bg-muted text-muted-foreground",
    cancelled: "bg-destructive/12 text-destructive",
  };
  const label: Record<AppointmentStatus, string> = {
    pending: "Awaiting confirmation",
    confirmed: "Confirmed",
    arrived: "Arrived",
    completed: "Completed",
    cancelled: "Cancelled",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-medium",
        map[status],
      )}
    >
      {label[status]}
    </span>
  );
}

export function InfoNotice({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs text-muted-foreground",
        className,
      )}
    >
      <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

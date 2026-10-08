import { useI18n, type MessageKey } from "@/lib/i18n";
import type { ApplicationStatus, VerificationState } from "@/lib/supabase/providers";
import { cn } from "@/lib/utils";

// Tints and text colours match the appointment status badges (contrast-checked in tests).
const TONE = {
  waiting: "bg-warning/15 text-warning-foreground dark:text-warning",
  good: "bg-success/15 text-success",
  bad: "bg-destructive/12 text-destructive",
  neutral: "bg-muted text-muted-foreground",
  verified: "bg-highlight-soft text-highlight",
} as const;

const APPLICATION: Record<ApplicationStatus, { key: MessageKey; tone: keyof typeof TONE }> = {
  submitted: { key: "apply.status.submitted", tone: "waiting" },
  approved: { key: "apply.status.approved", tone: "good" },
  rejected: { key: "apply.status.rejected", tone: "bad" },
  withdrawn: { key: "apply.status.withdrawn", tone: "neutral" },
};

const LINK: Record<VerificationState, { key: MessageKey; tone: keyof typeof TONE }> = {
  pending: { key: "verification.pending", tone: "waiting" },
  verified: { key: "verification.verified", tone: "verified" },
  rejected: { key: "verification.rejected", tone: "bad" },
};

function Pill({ tone, children }: { tone: keyof typeof TONE; children: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center rounded-full px-2.5 py-0.5 text-xs font-semibold",
        TONE[tone],
      )}
    >
      {children}
    </span>
  );
}

/**
 * A doctor–clinic link as it really is: its verification state, plus "Inactive" when the clinic
 * has switched the link off. Only a verified, active link is bookable.
 */
export function LinkStatus({ state, active }: { state: VerificationState; active: boolean }) {
  const { t } = useI18n();
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <VerificationPill state={state} />
      {active ? null : <Pill tone="neutral">{t("verification.inactive")}</Pill>}
    </span>
  );
}

export function ApplicationStatusPill({ status }: { status: ApplicationStatus }) {
  const { t } = useI18n();
  return <Pill tone={APPLICATION[status].tone}>{t(APPLICATION[status].key)}</Pill>;
}

export function VerificationPill({ state }: { state: VerificationState }) {
  const { t } = useI18n();
  return <Pill tone={LINK[state].tone}>{t(LINK[state].key)}</Pill>;
}

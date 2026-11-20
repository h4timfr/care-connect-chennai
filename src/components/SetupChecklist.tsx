import { Check, Circle, Clock3, Minus } from "lucide-react";
import { useId, type ReactNode } from "react";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { cn } from "@/lib/utils";

const states = {
  done: { label: "setup.done", icon: Check, tone: "text-success" },
  pending: {
    label: "setup.pending",
    icon: Clock3,
    tone: "text-warning-foreground dark:text-warning",
  },
  action: { label: "setup.action", icon: Circle, tone: "text-primary" },
  blocked: { label: "setup.blocked", icon: Minus, tone: "text-muted-foreground" },
  checking: { label: "common.loading", icon: Clock3, tone: "text-muted-foreground" },
  unavailable: { label: "setup.unavailable", icon: Minus, tone: "text-muted-foreground" },
} satisfies Record<string, { label: MessageKey; icon: typeof Check; tone: string }>;

export interface SetupStep {
  label: MessageKey;
  state: keyof typeof states;
  detail?: MessageKey;
  link?: ReactNode;
}

export function SetupChecklist({ title, steps }: { title: MessageKey; steps: SetupStep[] }) {
  const { t } = useI18n();
  const heading = useId();
  return (
    <section
      aria-labelledby={heading}
      data-tour-target={title === "setup.doctorTitle" ? "doctor-setup" : "clinic-setup"}
      className="surface-card min-w-0 p-4 sm:p-5"
    >
      <h2 id={heading} className="font-display text-lg font-semibold">
        {t(title)}
      </h2>
      <ol className="mt-2 divide-y" role="list">
        {steps.map(({ label, state, detail, link }) => {
          const { label: status, icon: Icon, tone } = states[state];
          return (
            <li key={label} className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2.5 py-2.5">
              <Icon className={cn("mt-0.5 size-4", tone)} aria-hidden />
              <div className="min-w-0">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-sm">
                  <span className="font-medium [overflow-wrap:anywhere]">{t(label)}</span>
                  <span className={cn("text-xs font-medium", tone)}>{t(status)}</span>
                </div>
                {detail ? <p className="mt-1 text-xs text-muted-foreground">{t(detail)}</p> : null}
                {link ? <div className="mt-1">{link}</div> : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

export const setupLinkClass =
  "inline-flex min-h-8 max-w-full items-center rounded-sm text-sm font-medium text-primary underline underline-offset-4 [overflow-wrap:anywhere] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring";

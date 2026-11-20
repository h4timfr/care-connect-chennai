import { CircleHelp } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { LanguageSelect } from "@/components/LanguageSelect";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { hasOnboardingDecision, rememberOnboardingDecision } from "@/lib/onboarding-preferences";

const tours = {
  patient: [
    { text: "tour.patient.find", target: "/discover" },
    { text: "tour.patient.book", target: "patient-book" },
    { text: "tour.patient.track", target: "/appointments" },
    { text: "tour.patient.message", target: "/messages" },
  ],
  doctor: [
    { text: "tour.doctor.verify", target: "doctor-setup" },
    { text: "tour.doctor.accept", target: "doctor-link-requests" },
    { text: "tour.doctor.hours", target: "/doctor/schedule" },
    { text: "tour.doctor.manage", target: "/doctor/appointments" },
  ],
  clinic: [
    { text: "tour.clinic.verify", target: "clinic-setup" },
    { text: "tour.clinic.link", target: "/clinic/doctors" },
    { text: "tour.clinic.schedule", target: "/clinic/calendar" },
    { text: "tour.clinic.manage", target: "/clinic/appointments" },
  ],
  admin: [
    { text: "tour.admin.review", target: "admin-applications" },
    { text: "tour.admin.verify", target: "admin-doctors" },
    { text: "tour.admin.publish", target: "admin-publication" },
  ],
} satisfies Record<string, { text: MessageKey; target: string }[]>;

export function GuidedTour({
  role,
  compact = false,
  iconOnly = false,
  startRequested = 0,
}: {
  role: keyof typeof tours;
  compact?: boolean;
  iconOnly?: boolean;
  startRequested?: number;
}) {
  const { t } = useI18n();
  const key = `careconnect.tour.${role}.v1`;
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<boolean | null>(null);
  const [index, setIndex] = useState(0);
  const [dialog, setDialog] = useState<HTMLDivElement | null>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const steps = tours[role];
  const step = steps[index] ?? steps[0]!;
  const last = index === steps.length - 1;
  const help = t(seen ? "tour.restart" : "tour.help");

  useEffect(() => {
    if (startRequested > 0) {
      setIndex(0);
      setOpen(true);
    }
  }, [startRequested]);

  useEffect(() => {
    setSeen(hasOnboardingDecision(key));
  }, [key]);

  useEffect(() => {
    if (!open) return;
    title.current?.focus({ preventScroll: true });
  }, [index, open]);

  useEffect(() => {
    if (!open || !dialog) return;
    const outline = document.createElement("div");
    outline.setAttribute("aria-hidden", "true");
    outline.setAttribute("data-tour-highlight", "");
    outline.className =
      "pointer-events-none fixed z-[51] rounded-md border-[3px] border-primary bg-primary/10";
    let frame: number | undefined;
    const findTarget = () => {
      frame = undefined;
      const bounds = dialog.getBoundingClientRect();
      const target = [...document.querySelectorAll<HTMLElement>("[data-tour-target]")].find(
        (element) => {
          if (
            element.dataset["tourTarget"] !== step.target ||
            getComputedStyle(element).visibility !== "visible"
          )
            return false;
          const rect = element.getBoundingClientRect();
          const top = element.closest("nav")?.getBoundingClientRect();
          return (
            rect.width > 0 &&
            rect.height > 0 &&
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= window.innerHeight &&
            rect.right <= window.innerWidth &&
            (!top ||
              (rect.left >= top.left &&
                rect.right <= top.right &&
                rect.top >= top.top &&
                rect.bottom <= top.bottom)) &&
            (rect.bottom <= bounds.top ||
              rect.top >= bounds.bottom ||
              rect.right <= bounds.left ||
              rect.left >= bounds.right)
          );
        },
      );
      if (!target) {
        outline.remove();
        return;
      }
      const rect = target.getBoundingClientRect();
      outline.style.cssText = `left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px`;
      if (!outline.isConnected) document.body.append(outline);
    };
    const scheduleHighlight = () => {
      frame ??= window.requestAnimationFrame(findTarget);
    };
    const observer = new ResizeObserver(scheduleHighlight);
    observer.observe(dialog);
    observer.observe(document.body);
    dialog.addEventListener("animationend", scheduleHighlight);
    window.addEventListener("resize", scheduleHighlight);
    window.addEventListener("scroll", scheduleHighlight, true);
    scheduleHighlight();
    return () => {
      if (frame !== undefined) window.cancelAnimationFrame(frame);
      observer.disconnect();
      dialog.removeEventListener("animationend", scheduleHighlight);
      window.removeEventListener("resize", scheduleHighlight);
      window.removeEventListener("scroll", scheduleHighlight, true);
      outline.remove();
    };
  }, [dialog, open, step.target]);

  const changeOpen = (value: boolean) => {
    if (value) {
      setIndex(0);
    } else {
      rememberOnboardingDecision(key);
      setSeen(true);
    }
    setOpen(value);
  };

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size={iconOnly ? "icon" : "sm"}
          disabled={seen === null}
          aria-label={iconOnly ? help : undefined}
          title={iconOnly ? help : undefined}
          className={compact ? "h-auto min-h-8 px-1.5 text-xs" : "h-auto min-h-9 whitespace-normal"}
        >
          <CircleHelp aria-hidden />
          {iconOnly ? null : help}
        </Button>
      </DialogTrigger>
      <DialogContent
        ref={setDialog}
        showClose={false}
        overlayClassName="bg-black/35 motion-reduce:animate-none"
        className="min-w-0 gap-3 rounded-xl p-4 [grid-template-columns:minmax(0,1fr)] motion-reduce:animate-none sm:p-5"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          title.current?.focus({ preventScroll: true });
        }}
      >
        <DialogTitle ref={title} tabIndex={-1} className="font-display leading-snug">
          {t(`tour.title.${role}`)}
        </DialogTitle>
        <div className="flex justify-end">
          <LanguageSelect showLabel />
        </div>
        <DialogDescription aria-live="polite" aria-atomic="true" className="space-y-2">
          <span className="block text-xs font-medium">
            {t("tour.progress", { step: index + 1, total: steps.length })}
          </span>
          <span className="block text-base text-foreground">{t(step.text)}</span>
        </DialogDescription>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-auto min-h-8 max-w-full whitespace-normal text-start"
            onClick={() => changeOpen(false)}
          >
            {t("tour.skip")}
          </Button>
          <div className="ms-auto flex flex-wrap gap-2">
            {index > 0 ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-auto min-h-8 max-w-full whitespace-normal text-start"
                onClick={() => setIndex(index - 1)}
              >
                {t("tour.back")}
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              className="h-auto min-h-8 max-w-full whitespace-normal text-start"
              onClick={() => (last ? changeOpen(false) : setIndex(index + 1))}
            >
              {t(last ? "tour.finish" : "tour.next")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

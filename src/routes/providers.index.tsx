import { createFileRoute, Link } from "@tanstack/react-router";
import {
  BadgeCheck,
  Building2,
  CalendarClock,
  ClipboardCheck,
  FileText,
  MessageSquare,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { PatientShell } from "@/components/layout/PatientShell";
import { Button } from "@/components/ui/button";
import { useI18n, type MessageKey } from "@/lib/i18n";

export const Route = createFileRoute("/providers/")({
  head: () => ({ meta: [{ title: "For clinics — CareConnect" }] }),
  component: ProvidersPage,
});

const STEPS: { icon: typeof FileText; title: MessageKey; body: MessageKey }[] = [
  { icon: FileText, title: "providers.step1.title", body: "providers.step1.body" },
  { icon: ShieldCheck, title: "providers.step2.title", body: "providers.step2.body" },
  { icon: Stethoscope, title: "providers.step3.title", body: "providers.step3.body" },
  { icon: BadgeCheck, title: "providers.step4.title", body: "providers.step4.body" },
];

const FEATURES: { icon: typeof FileText; title: MessageKey; body: MessageKey }[] = [
  {
    icon: CalendarClock,
    title: "providers.feature.schedule",
    body: "providers.feature.scheduleBody",
  },
  {
    icon: ClipboardCheck,
    title: "providers.feature.requests",
    body: "providers.feature.requestsBody",
  },
  {
    icon: MessageSquare,
    title: "providers.feature.messages",
    body: "providers.feature.messagesBody",
  },
];

function ProvidersPage() {
  const { t } = useI18n();
  return (
    <PatientShell>
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-highlight px-6 py-10 text-primary-foreground sm:px-10 sm:py-14">
        <div className="max-w-2xl">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-semibold">
            <Building2 className="h-3.5 w-3.5" aria-hidden />
            {t("providers.eyebrow")}
          </span>
          <h1 className="mt-4 font-display text-3xl font-bold leading-tight [overflow-wrap:anywhere] sm:text-4xl">
            {t("providers.title")}
          </h1>
          <p className="mt-3 text-base opacity-90 sm:text-lg">{t("providers.subtitle")}</p>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button asChild size="lg" className="bg-card text-foreground hover:bg-card/90">
              <Link to="/providers/apply">{t("providers.apply")}</Link>
            </Button>
            <Button
              asChild
              size="lg"
              variant="outline"
              className="border-white/40 bg-transparent text-primary-foreground hover:border-white hover:bg-white/10 hover:text-primary-foreground"
            >
              <Link to="/login" search={{ portal: "clinic" }}>
                {t("providers.signIn")}
              </Link>
            </Button>
          </div>
        </div>
      </section>

      <section aria-labelledby="how-heading" className="mt-10">
        <h2 id="how-heading" className="font-display text-xl font-bold sm:text-2xl">
          {t("providers.howTitle")}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{t("providers.howBody")}</p>
        <ol className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className="surface-card relative p-5">
              <span className="absolute end-4 top-4 font-display text-sm font-bold text-muted-foreground">
                {i + 1}
              </span>
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-highlight-soft text-highlight">
                <step.icon className="h-5 w-5" aria-hidden />
              </span>
              <h3 className="mt-3 font-semibold [overflow-wrap:anywhere]">{t(step.title)}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{t(step.body)}</p>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="features-heading" className="mt-10">
        <h2 id="features-heading" className="font-display text-xl font-bold sm:text-2xl">
          {t("providers.featuresTitle")}
        </h2>
        <ul className="mt-5 grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="flex gap-3 rounded-2xl border bg-card p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary-soft text-primary">
                <f.icon className="h-5 w-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <h3 className="font-semibold [overflow-wrap:anywhere]">{t(f.title)}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{t(f.body)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-10 rounded-2xl border border-warning/40 bg-warning/10 p-5 text-sm">
        <h2 className="font-semibold">{t("providers.samplesTitle")}</h2>
        <p className="mt-1">{t("providers.samplesBody")}</p>
      </section>
    </PatientShell>
  );
}

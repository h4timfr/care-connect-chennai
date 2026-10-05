import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PatientShell } from "@/components/layout/PatientShell";
import { FormAlert } from "@/components/AuthCard";
import { ErrorState, InfoNotice, PageLoader } from "@/components/common";
import { ApplicationStatusPill } from "@/components/ProviderStatus";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { codeOf, describeDataError, isNotDeployed, messageOf } from "@/lib/supabase/errors";
import {
  CONTACT_ROLES,
  CONTACT_ROLE_LABEL,
  useMyApplications,
  useSubmitApplication,
  useWithdrawApplication,
  type ContactRole,
  type ProviderApplication,
} from "@/lib/supabase/providers";

export const Route = createFileRoute("/providers/apply")({
  head: () => ({ meta: [{ title: "Apply as a clinic — CareConnect" }] }),
  component: ApplyPage,
});

const MAX_OPEN_APPLICATIONS = 3;

function ApplyPage() {
  const { user, loading } = useProtectedRoute();
  const { t } = useI18n();
  const applications = useMyApplications(user?.id);

  return (
    <PatientShell>
      <div className="mx-auto max-w-3xl">
        <h1 className="font-display text-2xl font-bold sm:text-3xl">{t("apply.title")}</h1>
        <p className="mt-1 text-muted-foreground">{t("apply.subtitle")}</p>

        <div className="mt-6">
          {loading || !user || applications.isLoading ? (
            <PageLoader
              label={!loading && !user ? t("common.redirectingToSignIn") : t("common.loading")}
            />
          ) : applications.error && isNotDeployed(applications.error) ? (
            <InfoNotice>{t("apply.notOpen")}</InfoNotice>
          ) : applications.error ? (
            <ErrorState
              title={t("apply.loadError")}
              message={t(describeDataError(applications.error))}
              onRetry={applications.refetch}
            />
          ) : (
            <ApplyContent applications={applications.data ?? []} defaultEmail={user.email ?? ""} />
          )}
        </div>
      </div>
    </PatientShell>
  );
}

function ApplyContent({
  applications,
  defaultEmail,
}: {
  applications: ProviderApplication[];
  defaultEmail: string;
}) {
  const { t } = useI18n();
  const openCount = applications.filter((a) => a.status === "submitted").length;
  const [justSubmitted, setJustSubmitted] = useState(false);

  return (
    <div className="space-y-8">
      {applications.length > 0 ? (
        <section aria-labelledby="my-applications">
          <h2 id="my-applications" className="text-lg font-semibold">
            {t("apply.yourApplications")}
          </h2>
          <ul className="mt-3 space-y-3">
            {applications.map((a) => (
              <ApplicationRow key={a.id} application={a} />
            ))}
          </ul>
        </section>
      ) : null}

      {justSubmitted ? (
        <div role="status" className="surface-card flex gap-3 p-5">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
          <div>
            <h2 className="font-semibold">{t("apply.submittedTitle")}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t("apply.submittedBody")}</p>
          </div>
        </div>
      ) : openCount >= MAX_OPEN_APPLICATIONS ? (
        <InfoNotice>{t("apply.limitReached", { count: MAX_OPEN_APPLICATIONS })}</InfoNotice>
      ) : (
        <ApplicationForm defaultEmail={defaultEmail} onSubmitted={() => setJustSubmitted(true)} />
      )}
    </div>
  );
}

function ApplicationRow({ application: a }: { application: ProviderApplication }) {
  const { t, fmt } = useI18n();
  const withdraw = useWithdrawApplication();
  return (
    <li className="surface-card p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold [overflow-wrap:anywhere]" dir="auto">
            {a.clinicName}
          </p>
          <p className="text-sm text-muted-foreground" dir="auto">
            {a.area} · {t("apply.submittedOn", { date: fmt.longDate(a.createdAt.slice(0, 10)) })}
          </p>
        </div>
        <ApplicationStatusPill status={a.status} />
      </div>
      {a.reviewNote ? (
        <p className="mt-2 rounded-lg bg-muted px-3 py-2 text-sm" dir="auto">
          <span className="font-medium">{t("apply.reviewNote")}:</span> {a.reviewNote}
        </p>
      ) : null}
      {a.status === "approved" ? (
        <Button asChild size="sm" className="mt-3">
          <Link to="/clinic">{t("apply.openPortal")}</Link>
        </Button>
      ) : null}
      {a.status === "submitted" ? (
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          disabled={withdraw.isPending}
          onClick={async () => {
            try {
              await withdraw.mutateAsync(a.id);
              toast.success(t("apply.withdrawn"));
            } catch (err) {
              toast.error(t(describeDataError(err)));
            }
          }}
        >
          {t("apply.withdraw")}
        </Button>
      ) : null}
    </li>
  );
}

/** Mirrors the CHECK constraints on provider_applications so most mistakes are caught here. */
function validate(f: FormState): MessageKey | null {
  const len = (s: string) => s.trim().length;
  if (len(f.clinicName) < 2 || len(f.clinicName) > 120) return "apply.error.clinicName";
  if (len(f.area) < 2 || len(f.area) > 80) return "apply.error.area";
  if (len(f.address) < 5 || len(f.address) > 300) return "apply.error.address";
  if (len(f.contactName) < 2 || len(f.contactName) > 120) return "apply.error.contactName";
  if (!/^[0-9+() -]{6,30}$/.test(f.contactPhone.trim())) return "apply.error.phone";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.contactEmail.trim())) return "apply.error.email";
  if (len(f.registrationDetails) < 5 || len(f.registrationDetails) > 500)
    return "apply.error.registration";
  if (f.doctorCount && !(Number(f.doctorCount) >= 1 && Number(f.doctorCount) <= 500))
    return "apply.error.doctorCount";
  return null;
}

interface FormState {
  clinicName: string;
  area: string;
  address: string;
  contactName: string;
  contactRole: ContactRole;
  contactPhone: string;
  contactEmail: string;
  registrationDetails: string;
  doctorCount: string;
  message: string;
}

function ApplicationForm({
  defaultEmail,
  onSubmitted,
}: {
  defaultEmail: string;
  onSubmitted: () => void;
}) {
  const { t } = useI18n();
  const submit = useSubmitApplication();
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({
    clinicName: "",
    area: "",
    address: "",
    contactName: "",
    contactRole: "owner",
    contactPhone: "",
    contactEmail: defaultEmail,
    registrationDetails: "",
    doctorCount: "",
    message: "",
  });
  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const problem = validate(form);
    if (problem) {
      setError(t(problem));
      return;
    }
    setError(null);
    try {
      await submit.mutateAsync({
        clinic_name: form.clinicName.trim(),
        area: form.area.trim(),
        address: form.address.trim(),
        contact_name: form.contactName.trim(),
        contact_role: form.contactRole,
        contact_phone: form.contactPhone.trim(),
        contact_email: form.contactEmail.trim(),
        registration_details: form.registrationDetails.trim(),
        doctor_count: form.doctorCount ? Number(form.doctorCount) : null,
        message: form.message.trim() || null,
      });
      onSubmitted();
    } catch (err) {
      setError(
        codeOf(err) === "P0001" && /Rate Limit/i.test(messageOf(err))
          ? t("apply.limitReached", { count: MAX_OPEN_APPLICATIONS })
          : codeOf(err) === "23514"
            ? t("error.checkDetails")
            : t(describeDataError(err)),
      );
    }
  };

  const required = (
    <span className="text-destructive" aria-hidden>
      {" "}
      *
    </span>
  );

  return (
    <form
      onSubmit={onSubmit}
      noValidate
      className="surface-card space-y-5 p-5 sm:p-6"
      aria-labelledby="apply-form-title"
    >
      <div>
        <h2 id="apply-form-title" className="text-lg font-semibold">
          {t("apply.formTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("apply.requiredNote")}</p>
      </div>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-primary">
          {t("apply.section.clinic")}
        </legend>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="clinic-name">
            {t("apply.clinicName")}
            {required}
          </Label>
          <Input
            id="clinic-name"
            required
            maxLength={120}
            autoComplete="organization"
            value={form.clinicName}
            onChange={(e) => set("clinicName", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="clinic-area">
            {t("apply.area")}
            {required}
          </Label>
          <Input
            id="clinic-area"
            required
            maxLength={80}
            value={form.area}
            placeholder={t("details.areaPlaceholder")}
            onChange={(e) => set("area", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="doctor-count">{t("apply.doctorCount")}</Label>
          <Input
            id="doctor-count"
            type="number"
            inputMode="numeric"
            min={1}
            max={500}
            value={form.doctorCount}
            onChange={(e) => set("doctorCount", e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="clinic-address">
            {t("apply.address")}
            {required}
          </Label>
          <Textarea
            id="clinic-address"
            required
            maxLength={300}
            rows={2}
            autoComplete="street-address"
            value={form.address}
            onChange={(e) => set("address", e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="registration">
            {t("apply.registration")}
            {required}
          </Label>
          <Textarea
            id="registration"
            required
            maxLength={500}
            rows={3}
            aria-describedby="registration-hint"
            value={form.registrationDetails}
            onChange={(e) => set("registrationDetails", e.target.value)}
          />
          <p id="registration-hint" className="text-xs text-muted-foreground">
            {t("apply.registrationHint")}
          </p>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-semibold text-primary">
          {t("apply.section.contact")}
        </legend>
        <div className="space-y-1.5">
          <Label htmlFor="contact-name">
            {t("apply.contactName")}
            {required}
          </Label>
          <Input
            id="contact-name"
            required
            maxLength={120}
            autoComplete="name"
            value={form.contactName}
            onChange={(e) => set("contactName", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-role">
            {t("apply.contactRole")}
            {required}
          </Label>
          <NativeSelect
            id="contact-role"
            value={form.contactRole}
            onChange={(e) => {
              const next = CONTACT_ROLES.find((r) => r === e.target.value);
              if (next) set("contactRole", next);
            }}
          >
            {CONTACT_ROLES.map((r) => (
              <option key={r} value={r}>
                {t(CONTACT_ROLE_LABEL[r])}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-phone">
            {t("apply.phone")}
            {required}
          </Label>
          <Input
            id="contact-phone"
            type="tel"
            required
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            maxLength={30}
            value={form.contactPhone}
            onChange={(e) => set("contactPhone", e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="contact-email">
            {t("apply.email")}
            {required}
          </Label>
          <Input
            id="contact-email"
            type="email"
            required
            inputMode="email"
            autoComplete="email"
            dir="ltr"
            maxLength={254}
            value={form.contactEmail}
            onChange={(e) => set("contactEmail", e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="apply-message">{t("apply.message")}</Label>
          <Textarea
            id="apply-message"
            maxLength={1000}
            rows={3}
            value={form.message}
            onChange={(e) => set("message", e.target.value)}
          />
        </div>
      </fieldset>

      <p className="text-xs text-muted-foreground">{t("apply.privacy")}</p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <Button
        type="submit"
        variant="highlight"
        size="lg"
        className="w-full sm:w-auto"
        disabled={submit.isPending}
      >
        {submit.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {submit.isPending ? t("apply.submitting") : t("apply.submit")}
      </Button>
    </form>
  );
}

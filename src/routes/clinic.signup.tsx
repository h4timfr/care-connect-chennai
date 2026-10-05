import { createFileRoute, Link } from "@tanstack/react-router";
import { InfoNotice } from "@/components/common";
import { ApplicationStatusPill } from "@/components/ProviderStatus";
import { ProviderSignup, Required } from "@/components/ProviderSignup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth";
import { isNotDeployed } from "@/lib/supabase/errors";
import {
  CONTACT_ROLES,
  CONTACT_ROLE_LABEL,
  useMyApplications,
  useSubmitApplication,
  type ContactRole,
} from "@/lib/supabase/providers";

export const Route = createFileRoute("/clinic/signup")({
  head: () => ({ meta: [{ title: "Register a clinic — CareConnect" }] }),
  component: ClinicSignup,
});

interface ClinicForm {
  clinicName: string;
  area: string;
  address: string;
  registrationDetails: string;
  doctorCount: string;
  contactName: string;
  contactRole: ContactRole;
  contactPhone: string;
  contactEmail: string;
  message: string;
}

const INITIAL: ClinicForm = {
  clinicName: "",
  area: "",
  address: "",
  registrationDetails: "",
  doctorCount: "",
  contactName: "",
  contactRole: "owner",
  contactPhone: "",
  contactEmail: "",
  message: "",
};

/** Mirrors the CHECK constraints on provider_applications (migration 00054). */
function validate(f: ClinicForm): MessageKey | null {
  const len = (s: string) => s.trim().length;
  if (len(f.clinicName) < 2 || len(f.clinicName) > 120) return "apply.error.clinicName";
  if (len(f.area) < 2 || len(f.area) > 80) return "apply.error.area";
  if (len(f.address) < 5 || len(f.address) > 300) return "apply.error.address";
  if (len(f.registrationDetails) < 5 || len(f.registrationDetails) > 500)
    return "apply.error.registration";
  if (f.doctorCount && !(Number(f.doctorCount) >= 1 && Number(f.doctorCount) <= 500))
    return "apply.error.doctorCount";
  if (len(f.contactName) < 2 || len(f.contactName) > 120) return "apply.error.contactName";
  if (!/^[0-9+() -]{6,30}$/.test(f.contactPhone.trim())) return "apply.error.phone";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.contactEmail.trim())) return "apply.error.email";
  return null;
}

/** provider_applications allows at most this many open applications per account (00054). */
const MAX_OPEN = 3;

function ClinicSignup() {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const { memberClinics } = useApp();
  const mine = useMyApplications(user?.id);
  const submitApplication = useSubmitApplication();
  const list = mine.data ?? [];

  const extras = (
    <>
      {memberClinics.length > 0 ? (
        <InfoNotice className="text-sm">
          {t("signup.clinic.alreadyMember")}{" "}
          <Link to="/clinic" className="font-semibold underline-offset-2 hover:underline">
            {t("profile.openClinicPortal")}
          </Link>
        </InfoNotice>
      ) : null}
      {list.length > 0 ? (
        <section aria-labelledby="my-clinic-applications">
          <h2 id="my-clinic-applications" className="text-sm font-semibold">
            {t("apply.yourApplications")}
          </h2>
          <ul className="mt-2 space-y-2">
            {list.map((a) => (
              <li
                key={a.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
              >
                <div className="min-w-0">
                  <p className="font-medium [overflow-wrap:anywhere]" dir="auto">
                    {a.clinicName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t("apply.submittedOn", { date: fmt.longDate(a.createdAt.slice(0, 10)) })}
                  </p>
                  {a.reviewNote ? (
                    <p className="mt-1 text-xs" dir="auto">
                      {a.reviewNote}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-2">
                  <ApplicationStatusPill status={a.status} />
                  {a.status === "approved" ? (
                    <Button asChild size="sm">
                      <Link to="/clinic">{t("apply.openPortal")}</Link>
                    </Button>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );

  return (
    <ProviderSignup<ClinicForm>
      portal="clinic"
      title={t("signup.clinic.title")}
      subtitle={t("signup.clinic.subtitle")}
      draftKey="careconnect.clinicApplicationDraft"
      initial={{ ...INITIAL, contactEmail: user?.email ?? "" }}
      validate={validate}
      withAccount={(f, account) => ({
        ...f,
        contactName: f.contactName || account.name,
        contactEmail: f.contactEmail || account.email,
      })}
      signedInExtras={extras}
      blocked={
        mine.error && isNotDeployed(mine.error) ? (
          <InfoNotice>{t("signup.notOpen")}</InfoNotice>
        ) : list.filter((a) => a.status === "submitted").length >= MAX_OPEN ? (
          <InfoNotice>{t("apply.limitReached", { count: MAX_OPEN })}</InfoNotice>
        ) : undefined
      }
      submit={async (f) => {
        await submitApplication.mutateAsync({
          clinic_name: f.clinicName.trim(),
          area: f.area.trim(),
          address: f.address.trim(),
          registration_details: f.registrationDetails.trim(),
          doctor_count: f.doctorCount ? Number(f.doctorCount) : null,
          contact_name: f.contactName.trim(),
          contact_role: f.contactRole,
          contact_phone: f.contactPhone.trim(),
          contact_email: f.contactEmail.trim(),
          message: f.message.trim() || null,
        });
      }}
      renderFields={(f, set) => (
        <>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-primary">
              {t("apply.section.clinic")}
            </legend>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="clinic-name">
                {t("apply.clinicName")}
                <Required />
              </Label>
              <Input
                id="clinic-name"
                required
                maxLength={120}
                autoComplete="organization"
                value={f.clinicName}
                onChange={(e) => set("clinicName", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="clinic-area">
                {t("apply.area")}
                <Required />
              </Label>
              <Input
                id="clinic-area"
                required
                maxLength={80}
                placeholder={t("details.areaPlaceholder")}
                value={f.area}
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
                value={f.doctorCount}
                onChange={(e) => set("doctorCount", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="clinic-address">
                {t("apply.address")}
                <Required />
              </Label>
              <Textarea
                id="clinic-address"
                required
                rows={2}
                maxLength={300}
                autoComplete="street-address"
                value={f.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="registration">
                {t("apply.registration")}
                <Required />
              </Label>
              <Textarea
                id="registration"
                required
                rows={2}
                maxLength={500}
                aria-describedby="registration-hint"
                value={f.registrationDetails}
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
              <Label htmlFor="contact-name">{t("apply.contactName")}</Label>
              <Input
                id="contact-name"
                maxLength={120}
                autoComplete="name"
                placeholder={t("signup.sameAsAccount")}
                value={f.contactName}
                onChange={(e) => set("contactName", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-role">
                {t("apply.contactRole")}
                <Required />
              </Label>
              <NativeSelect
                id="contact-role"
                value={f.contactRole}
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
                <Required />
              </Label>
              <Input
                id="contact-phone"
                type="tel"
                required
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                maxLength={30}
                value={f.contactPhone}
                onChange={(e) => set("contactPhone", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-email">{t("signup.clinic.officialEmail")}</Label>
              <Input
                id="contact-email"
                type="email"
                inputMode="email"
                dir="ltr"
                maxLength={254}
                placeholder={t("signup.sameAsAccount")}
                value={f.contactEmail}
                onChange={(e) => set("contactEmail", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="apply-message">{t("apply.message")}</Label>
              <Textarea
                id="apply-message"
                rows={2}
                maxLength={1000}
                value={f.message}
                onChange={(e) => set("message", e.target.value)}
              />
            </div>
          </fieldset>
        </>
      )}
    />
  );
}

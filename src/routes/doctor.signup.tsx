import { createFileRoute, Link } from "@tanstack/react-router";
import { InfoNotice } from "@/components/common";
import { ApplicationStatusPill } from "@/components/ProviderStatus";
import { ProviderSignup, Required } from "@/components/ProviderSignup";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { SPECIALTIES } from "@/lib/format";
import { useI18n, type MessageKey } from "@/lib/i18n";
import { useAuth } from "@/lib/supabase/auth";
import {
  useMyDoctor,
  useMyDoctorApplications,
  useSubmitDoctorApplication,
} from "@/lib/supabase/doctor";
import { isNotDeployed } from "@/lib/supabase/errors";
import { useClinics } from "@/lib/supabase/queries";

export const Route = createFileRoute("/doctor/signup")({
  head: () => ({ meta: [{ title: "Register as a doctor — CareConnect" }] }),
  component: DoctorSignup,
});

interface DoctorForm {
  fullName: string;
  specialtyId: string;
  qualifications: string;
  registrationCouncil: string;
  registrationNumber: string;
  experienceYears: string;
  consultationFee: string;
  clinicId: string;
  clinicNote: string;
  contactPhone: string;
  contactEmail: string;
  message: string;
}

const INITIAL: DoctorForm = {
  fullName: "",
  specialtyId: "general",
  qualifications: "",
  registrationCouncil: "",
  registrationNumber: "",
  experienceYears: "",
  consultationFee: "",
  clinicId: "",
  clinicNote: "",
  contactPhone: "",
  contactEmail: "",
  message: "",
};

/** Mirrors the CHECK constraints on doctor_applications (migration 00055). */
function validate(f: DoctorForm): MessageKey | null {
  const len = (s: string) => s.trim().length;
  if (len(f.fullName) < 3 || len(f.fullName) > 120) return "propose.error.name";
  if (len(f.qualifications) < 2 || len(f.qualifications) > 300)
    return "signup.doctor.error.qualifications";
  if (len(f.registrationCouncil) < 2 || len(f.registrationCouncil) > 80)
    return "signup.doctor.error.council";
  if (len(f.registrationNumber) < 2 || len(f.registrationNumber) > 40)
    return "signup.doctor.error.number";
  const years = Number(f.experienceYears);
  if (!f.experienceYears || !Number.isInteger(years) || years < 0 || years > 70)
    return "propose.error.experience";
  if (
    f.consultationFee &&
    !(Number(f.consultationFee) >= 0 && Number(f.consultationFee) <= 100000)
  ) {
    return "propose.error.fee";
  }
  if (len(f.clinicNote) > 200) return "signup.doctor.error.clinicNote";
  if (!/^[0-9+() -]{6,30}$/.test(f.contactPhone.trim())) return "apply.error.phone";
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.contactEmail.trim())) return "apply.error.email";
  return null;
}

function DoctorSignup() {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const doctor = useMyDoctor(user?.id);
  const mine = useMyDoctorApplications(user?.id);
  const submitApplication = useSubmitDoctorApplication();
  // Only real (non-sample) clinics can be named; the link the admin creates starts pending.
  const clinics = (useClinics().data ?? []).filter((c) => !c.isSample);
  const list = mine.data ?? [];

  const extras = (
    <>
      {list.length > 0 ? (
        <section aria-labelledby="my-doctor-applications">
          <h2 id="my-doctor-applications" className="text-sm font-semibold">
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
                    {a.fullName}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmt.specialty(a.specialtyId)} ·{" "}
                    {t("apply.submittedOn", { date: fmt.longDate(a.createdAt.slice(0, 10)) })}
                  </p>
                  {a.reviewNote ? (
                    <p className="mt-1 text-xs" dir="auto">
                      {a.reviewNote}
                    </p>
                  ) : null}
                </div>
                <ApplicationStatusPill status={a.status} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );

  const blocked = doctor.data ? (
    <div className="space-y-3 rounded-xl border p-4 text-sm">
      <p>{t("signup.alreadyDoctor")}</p>
      <Button asChild>
        <Link to="/doctor">{t("signup.doctor.openPortal")}</Link>
      </Button>
    </div>
  ) : mine.error && isNotDeployed(mine.error) ? (
    <InfoNotice>{t("signup.notOpen")}</InfoNotice>
  ) : list.filter((a) => a.status === "submitted").length >= 2 ? (
    <InfoNotice>{t("signup.limit")}</InfoNotice>
  ) : undefined;

  return (
    <ProviderSignup<DoctorForm>
      portal="doctor"
      title={t("signup.doctor.title")}
      subtitle={t("signup.doctor.subtitle")}
      draftKey="careconnect.doctorApplicationDraft"
      initial={{ ...INITIAL, contactEmail: user?.email ?? "" }}
      validate={validate}
      withAccount={(f, account) => ({
        ...f,
        fullName: f.fullName || account.name,
        contactEmail: f.contactEmail || account.email,
      })}
      signedInExtras={extras}
      blocked={blocked}
      submit={async (f) => {
        await submitApplication.mutateAsync({
          full_name: f.fullName.trim(),
          specialty_id: f.specialtyId,
          qualifications: f.qualifications.trim(),
          registration_council: f.registrationCouncil.trim(),
          registration_number: f.registrationNumber.trim(),
          experience_years: Number(f.experienceYears),
          consultation_fee: f.consultationFee ? Number(f.consultationFee) : null,
          clinic_id: f.clinicId || null,
          clinic_note: f.clinicNote.trim() || null,
          contact_phone: f.contactPhone.trim(),
          contact_email: f.contactEmail.trim(),
          message: f.message.trim() || null,
        });
      }}
      renderFields={(f, set) => (
        <>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-primary">
              {t("signup.doctor.section.professional")}
            </legend>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="doctor-name">{t("propose.name")}</Label>
              <Input
                id="doctor-name"
                maxLength={120}
                placeholder={t("signup.sameAsAccount")}
                value={f.fullName}
                onChange={(e) => set("fullName", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doctor-specialty">
                {t("propose.specialty")}
                <Required />
              </Label>
              <NativeSelect
                id="doctor-specialty"
                value={f.specialtyId}
                onChange={(e) => set("specialtyId", e.target.value)}
              >
                {SPECIALTIES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fmt.specialty(s.id)}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doctor-experience">
                {t("propose.experience")}
                <Required />
              </Label>
              <Input
                id="doctor-experience"
                type="number"
                inputMode="numeric"
                min={0}
                max={70}
                value={f.experienceYears}
                onChange={(e) => set("experienceYears", e.target.value)}
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="doctor-qualifications">
                {t("signup.doctor.qualifications")}
                <Required />
              </Label>
              <Input
                id="doctor-qualifications"
                maxLength={300}
                placeholder="MBBS, MD (Paediatrics)"
                value={f.qualifications}
                onChange={(e) => set("qualifications", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doctor-council">
                {t("signup.doctor.council")}
                <Required />
              </Label>
              <Input
                id="doctor-council"
                maxLength={80}
                placeholder={t("signup.doctor.councilPlaceholder")}
                value={f.registrationCouncil}
                onChange={(e) => set("registrationCouncil", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doctor-number">
                {t("signup.doctor.number")}
                <Required />
              </Label>
              <Input
                id="doctor-number"
                maxLength={40}
                dir="ltr"
                value={f.registrationNumber}
                onChange={(e) => set("registrationNumber", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doctor-fee">{t("propose.fee")}</Label>
              <Input
                id="doctor-fee"
                type="number"
                inputMode="numeric"
                min={0}
                max={100000}
                value={f.consultationFee}
                onChange={(e) => set("consultationFee", e.target.value)}
              />
            </div>
          </fieldset>
          <fieldset className="grid gap-4 sm:grid-cols-2">
            <legend className="mb-2 text-sm font-semibold text-primary">
              {t("signup.doctor.section.practice")}
            </legend>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="doctor-clinic">{t("signup.doctor.clinic")}</Label>
              <NativeSelect
                id="doctor-clinic"
                value={f.clinicId}
                onChange={(e) => set("clinicId", e.target.value)}
                aria-describedby="doctor-clinic-hint"
              >
                <option value="">{t("signup.doctor.noClinic")}</option>
                {clinics.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.area ? ` · ${c.area}` : ""}
                  </option>
                ))}
              </NativeSelect>
              <p id="doctor-clinic-hint" className="text-xs text-muted-foreground">
                {t("signup.doctor.clinicHint")}
              </p>
            </div>
            {!f.clinicId ? (
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="doctor-clinic-note">{t("signup.doctor.clinicNote")}</Label>
                <Input
                  id="doctor-clinic-note"
                  maxLength={200}
                  value={f.clinicNote}
                  onChange={(e) => set("clinicNote", e.target.value)}
                />
              </div>
            ) : null}
            <div className="space-y-1.5">
              <Label htmlFor="doctor-phone">
                {t("apply.phone")}
                <Required />
              </Label>
              <Input
                id="doctor-phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                maxLength={30}
                value={f.contactPhone}
                onChange={(e) => set("contactPhone", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="doctor-email">{t("apply.email")}</Label>
              <Input
                id="doctor-email"
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
              <Label htmlFor="doctor-message">{t("apply.message")}</Label>
              <Textarea
                id="doctor-message"
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

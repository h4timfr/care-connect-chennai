import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { DoctorShell } from "@/components/layout/DoctorShell";
import { FormAlert } from "@/components/AuthCard";
import { InfoNotice } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { useUpdateMyDoctor, type MyDoctor } from "@/lib/supabase/doctor";
import { codeOf, describeDataError } from "@/lib/supabase/errors";

export const Route = createFileRoute("/doctor/profile")({
  head: () => ({ meta: [{ title: "Profile — CareConnect Doctor Portal" }] }),
  component: DoctorProfilePage,
});

function DoctorProfilePage() {
  const { t } = useI18n();
  return (
    <DoctorShell title={t("doctorProfile.title")} description={t("doctorProfile.subtitle")}>
      {(me) => <ProfileForm key={me.id} me={me} />}
    </DoctorShell>
  );
}

const list = (s: string) =>
  s
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, 10);

function ProfileForm({ me }: { me: MyDoctor }) {
  const { t, fmt } = useI18n();
  const update = useUpdateMyDoctor();
  const [about, setAbout] = useState(me.about);
  const [languages, setLanguages] = useState(me.languages.join(", "));
  const [qualifications, setQualifications] = useState(me.qualifications.join(", "));
  const [experience, setExperience] = useState(String(me.experienceYears));
  const [fee, setFee] = useState(String(me.consultationFee));
  const [error, setError] = useState<string | null>(null);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    const years = Number(experience);
    const amount = Number(fee);
    if (!Number.isInteger(years) || years < 0 || years > 70)
      return setError(t("propose.error.experience"));
    if (!(amount >= 0 && amount <= 100000) || fee.trim() === "")
      return setError(t("propose.error.fee"));
    if (about.length > 1000) return setError(t("error.checkDetails"));
    setError(null);
    try {
      await update.mutateAsync({
        doctorId: me.id,
        update: {
          about,
          languages: list(languages),
          qualifications: list(qualifications),
          experienceYears: years,
          consultationFee: amount,
        },
      });
      toast.success(t("details.saved"));
    } catch (err) {
      setError(codeOf(err) === "P0001" ? t("doctorProfile.notAllowed") : t(describeDataError(err)));
    }
  };

  // Identity fields come from the verified registration and are changed only by CareConnect.
  const managed: [string, string][] = [
    [t("propose.name"), me.name],
    [t("propose.specialty"), fmt.specialty(me.specialtyId)],
    [t("propose.registration"), me.registrationNote || t("common.notProvided")],
  ];

  return (
    <div className="max-w-2xl space-y-6">
      <section className="surface-card p-5" aria-labelledby="managed-heading">
        <h2 id="managed-heading" className="font-semibold">
          {t("doctorProfile.managedTitle")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("doctorProfile.managedBody")}</p>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          {managed.map(([label, value]) => (
            <div key={label} className="min-w-0">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium [overflow-wrap:anywhere]" dir="auto">
                {value}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      <form
        onSubmit={save}
        noValidate
        className="surface-card space-y-4 p-5"
        aria-labelledby="editable-heading"
      >
        <h2 id="editable-heading" className="font-semibold">
          {t("doctorProfile.editableTitle")}
        </h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="dp-experience">{t("propose.experience")}</Label>
            <Input
              id="dp-experience"
              type="number"
              inputMode="numeric"
              min={0}
              max={70}
              value={experience}
              onChange={(e) => setExperience(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="dp-fee">{t("propose.fee")}</Label>
            <Input
              id="dp-fee"
              type="number"
              inputMode="numeric"
              min={0}
              max={100000}
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              aria-describedby="dp-fee-hint"
            />
            <p id="dp-fee-hint" className="text-xs text-muted-foreground">
              {t("doctorProfile.feeHint")}
            </p>
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="dp-qualifications">{t("propose.qualifications")}</Label>
            <Input
              id="dp-qualifications"
              value={qualifications}
              onChange={(e) => setQualifications(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="dp-languages">{t("propose.languages")}</Label>
            <Input
              id="dp-languages"
              value={languages}
              onChange={(e) => setLanguages(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="dp-about">{t("propose.about")}</Label>
            <Textarea
              id="dp-about"
              rows={4}
              maxLength={1000}
              value={about}
              onChange={(e) => setAbout(e.target.value)}
            />
          </div>
        </div>
        <InfoNotice className="text-xs">{t("doctorProfile.publicNote")}</InfoNotice>
        {error ? <FormAlert>{error}</FormAlert> : null}
        <Button type="submit" disabled={update.isPending}>
          {update.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {update.isPending ? t("common.saving") : t("details.save")}
        </Button>
      </form>
    </div>
  );
}

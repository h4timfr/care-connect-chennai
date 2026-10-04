import { Loader2, Pencil, User } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FormAlert } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { isoDate } from "@/lib/format";
import { LANGUAGES, languageInfo, normalizeLanguage, useI18n } from "@/lib/i18n";
import { describeDataError, codeOf } from "@/lib/supabase/errors";
import { useUpdatePatientDetails, type PatientDetails } from "@/lib/supabase/queries";
import type { Patient } from "@/lib/types";

const MAX_NAME_LENGTH = 120;
const MAX_TEXT_LENGTH = 80;

/** The stored language as people read it: a supported language's own name, else the raw value. */
function useLanguageLabel() {
  return (value: string) => {
    const code = normalizeLanguage(value);
    return code ? languageInfo(code).nativeName : value;
  };
}

/** Personal details, editable by the patient (their own `patients` row only). */
export function PersonalDetailsCard({ patient }: { patient: Patient }) {
  const [editing, setEditing] = useState(false);
  const { t, fmt } = useI18n();
  const languageLabel = useLanguageLabel();

  const rows: { label: string; value: string; note?: string; ltr?: boolean }[] = [
    { label: t("details.email"), value: patient.email, note: t("details.emailNote"), ltr: true },
    { label: t("details.phone"), value: patient.phone, ltr: true },
    { label: t("details.dateOfBirth"), value: fmt.fullDate(patient.dateOfBirth) },
    { label: t("details.gender"), value: patient.gender ? t(`common.${patient.gender}`) : "" },
    { label: t("details.area"), value: patient.area },
    { label: t("details.preferredLanguage"), value: languageLabel(patient.preferredLanguage) },
  ];

  return (
    <section className="surface-card space-y-4 p-6" aria-labelledby="details-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="details-heading" className="flex items-center gap-2 font-medium">
          <User className="h-4 w-4" aria-hidden /> {t("details.heading")}
        </h2>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden /> {t("common.edit")}
          </Button>
        ) : null}
      </div>
      {editing ? (
        <DetailsForm patient={patient} onDone={() => setEditing(false)} />
      ) : (
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          {rows.map((d) => (
            <div key={d.label} className="min-w-0">
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd
                className={d.value ? "break-words font-medium" : "text-muted-foreground"}
                dir={d.value && d.ltr ? "ltr" : undefined}
              >
                {d.value || t("common.notProvided")}
              </dd>
              {d.note && d.value ? (
                <dd className="text-xs text-muted-foreground">{d.note}</dd>
              ) : null}
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function DetailsForm({ patient, onDone }: { patient: Patient; onDone: () => void }) {
  const { mutateAsync: save, isPending } = useUpdatePatientDetails();
  const { t, lang, setLanguage } = useI18n();
  const [fullName, setFullName] = useState(patient.name);
  const [dateOfBirth, setDateOfBirth] = useState(patient.dateOfBirth);
  const [gender, setGender] = useState<PatientDetails["gender"]>(patient.gender);
  const [area, setArea] = useState(patient.area);
  // A value saved before this became a picker (e.g. "Kannada") stays selectable, so saving other
  // details never silently erases it.
  const legacyLanguage =
    patient.preferredLanguage && !normalizeLanguage(patient.preferredLanguage)
      ? patient.preferredLanguage
      : null;
  const [language, setLanguageValue] = useState(
    normalizeLanguage(patient.preferredLanguage) ?? legacyLanguage ?? "",
  );
  const [error, setError] = useState<string | null>(null);
  const today = isoDate(new Date());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    const name = fullName.trim();
    if (!name) {
      setError(t("details.nameRequired"));
      return;
    }
    if (dateOfBirth && (dateOfBirth > today || dateOfBirth < "1900-01-01")) {
      setError(t("details.invalidDob"));
      return;
    }
    setError(null);
    try {
      await save({
        patientId: patient.id,
        details: {
          fullName: name,
          dateOfBirth: dateOfBirth || null,
          gender,
          area: area.trim() || null,
          preferredLanguage: language || null,
        },
      });
      toast.success(t("details.saved"));
      const uiLanguage = normalizeLanguage(language);
      if (uiLanguage && uiLanguage !== lang) void setLanguage(uiLanguage);
      onDone();
    } catch (err) {
      // 23514/22007/22P02: a database constraint or type rejected one of the values.
      setError(
        ["23514", "22007", "22008", "22P02"].includes(codeOf(err))
          ? t("error.checkDetails")
          : t(describeDataError(err)),
      );
    }
  };

  const selectClass =
    "h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="details-name">{t("details.fullName")}</Label>
          <Input
            id="details-name"
            autoComplete="name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            maxLength={MAX_NAME_LENGTH}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="details-dob">{t("details.dateOfBirth")}</Label>
          <Input
            id="details-dob"
            type="date"
            autoComplete="bday"
            value={dateOfBirth}
            min="1900-01-01"
            max={today}
            onChange={(e) => setDateOfBirth(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="details-gender">{t("details.gender")}</Label>
          <select
            id="details-gender"
            value={gender ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              setGender(value === "male" || value === "female" || value === "other" ? value : null);
            }}
            className={selectClass}
          >
            <option value="">{t("details.preferNotToSay")}</option>
            <option value="female">{t("common.female")}</option>
            <option value="male">{t("common.male")}</option>
            <option value="other">{t("common.other")}</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="details-area">{t("details.area")}</Label>
          <Input
            id="details-area"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            maxLength={MAX_TEXT_LENGTH}
            placeholder={t("details.areaPlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="details-language">{t("details.preferredLanguage")}</Label>
          <select
            id="details-language"
            value={language}
            onChange={(e) => setLanguageValue(e.target.value)}
            aria-describedby="details-language-note"
            className={selectClass}
          >
            <option value="">{t("details.notChosen")}</option>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code} lang={l.locale}>
                {l.nativeName}
              </option>
            ))}
            {legacyLanguage ? <option value={legacyLanguage}>{legacyLanguage}</option> : null}
          </select>
          <p id="details-language-note" className="text-xs text-muted-foreground">
            {t("details.languageNote")}
          </p>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("details.managedNote")}</p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {isPending ? t("common.saving") : t("details.save")}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

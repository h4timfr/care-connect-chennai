import { Loader2, Pencil, User } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { FormAlert } from "@/components/AuthCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { fullDate, isoDate } from "@/lib/format";
import { describeDataError, codeOf } from "@/lib/supabase/errors";
import { useUpdatePatientDetails, type PatientDetails } from "@/lib/supabase/queries";
import type { Patient } from "@/lib/types";

const GENDER_LABEL = { male: "Male", female: "Female", other: "Other" } as const;
const MAX_NAME_LENGTH = 120;
const MAX_TEXT_LENGTH = 80;

/** Personal details, editable by the patient (their own `patients` row only). */
export function PersonalDetailsCard({ patient }: { patient: Patient }) {
  const [editing, setEditing] = useState(false);

  const rows: { label: string; value: string; note?: string }[] = [
    { label: "Email", value: patient.email, note: "Used to sign in" },
    { label: "Phone", value: patient.phone },
    { label: "Date of birth", value: fullDate(patient.dateOfBirth) },
    { label: "Gender", value: patient.gender ? GENDER_LABEL[patient.gender] : "" },
    { label: "Area", value: patient.area },
    { label: "Preferred language", value: patient.preferredLanguage },
  ];

  return (
    <section className="surface-card space-y-4 p-6" aria-labelledby="details-heading">
      <div className="flex items-center justify-between gap-3">
        <h2 id="details-heading" className="flex items-center gap-2 font-medium">
          <User className="h-4 w-4" aria-hidden /> Personal details
        </h2>
        {!editing ? (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="h-3.5 w-3.5" aria-hidden /> Edit
          </Button>
        ) : null}
      </div>
      {editing ? (
        <DetailsForm patient={patient} onDone={() => setEditing(false)} />
      ) : (
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          {rows.map((d) => (
            <div key={d.label}>
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className={d.value ? "font-medium" : "text-muted-foreground"}>
                {d.value || "Not provided"}
              </dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}

function DetailsForm({ patient, onDone }: { patient: Patient; onDone: () => void }) {
  const { mutateAsync: save, isPending } = useUpdatePatientDetails();
  const [fullName, setFullName] = useState(patient.name);
  const [dateOfBirth, setDateOfBirth] = useState(patient.dateOfBirth);
  const [gender, setGender] = useState<PatientDetails["gender"]>(patient.gender);
  const [area, setArea] = useState(patient.area);
  const [language, setLanguage] = useState(patient.preferredLanguage);
  const [error, setError] = useState<string | null>(null);
  const today = isoDate(new Date());

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (isPending) return;
    const name = fullName.trim();
    if (!name) {
      setError("Please enter your name.");
      return;
    }
    if (dateOfBirth && (dateOfBirth > today || dateOfBirth < "1900-01-01")) {
      setError("Please enter a valid date of birth.");
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
          preferredLanguage: language.trim() || null,
        },
      });
      toast.success("Your details have been saved.");
      onDone();
    } catch (err) {
      // 23514/22007/22P02: a database constraint or type rejected one of the values.
      setError(
        ["23514", "22007", "22008", "22P02"].includes(codeOf(err))
          ? "Please check the details you entered."
          : describeDataError(err),
      );
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="details-name">Full name</Label>
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
          <Label htmlFor="details-dob">Date of birth</Label>
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
          <Label htmlFor="details-gender">Gender</Label>
          <select
            id="details-gender"
            value={gender ?? ""}
            onChange={(e) => {
              const value = e.target.value;
              setGender(value === "male" || value === "female" || value === "other" ? value : null);
            }}
            className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Prefer not to say</option>
            <option value="female">Female</option>
            <option value="male">Male</option>
            <option value="other">Other</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="details-area">Area</Label>
          <Input
            id="details-area"
            value={area}
            onChange={(e) => setArea(e.target.value)}
            maxLength={MAX_TEXT_LENGTH}
            placeholder="e.g. Adyar"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="details-language">Preferred language</Label>
          <Input
            id="details-language"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            maxLength={MAX_TEXT_LENGTH}
            placeholder="e.g. Tamil"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">
        Your email and phone number are managed with your sign-in details and can't be changed here.
      </p>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={isPending}>
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {isPending ? "Saving…" : "Save details"}
        </Button>
        <Button type="button" variant="ghost" onClick={onDone} disabled={isPending}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

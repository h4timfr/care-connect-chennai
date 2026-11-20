import { pageTitles } from "@/lib/page-titles";
import { createFileRoute } from "@tanstack/react-router";
import { CalendarClock, Loader2, Stethoscope, UserPlus } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "@/lib/toast";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { DoctorClinicLinkRequests } from "@/components/DoctorClinicLinkRequests";
import { FormAlert } from "@/components/AuthCard";
import { EmptyState, ErrorState, InfoNotice, Initials, PageLoader } from "@/components/common";
import { LinkStatus } from "@/components/ProviderStatus";
import { ScheduleForm, ScheduleRow } from "@/components/ScheduleEditor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth";
import { SPECIALTIES } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { codeOf, describeDataError, isNotDeployed, messageOf } from "@/lib/supabase/errors";
import { useDoctorClinicLinkRequests } from "@/lib/supabase/doctor-clinic-links";
import {
  scheduleHasBookableWindow,
  useClinicDoctorLinks,
  useClinicSchedules,
  useProposeDoctor,
  type DoctorLink,
  type Schedule,
} from "@/lib/supabase/providers";

export const Route = createFileRoute("/clinic/doctors")({
  head: () => ({ meta: [{ title: pageTitles.clinic }] }),
  component: ClinicDoctors,
});

function ClinicDoctors() {
  const { doctors, activeClinic } = useApp();
  const { user } = useAuth();
  const { t } = useI18n();
  const title = t("clinicDoctors.title");
  const subtitle = t("clinicDoctors.subtitle");
  const links = useClinicDoctorLinks(activeClinic?.id);
  const schedules = useClinicSchedules(activeClinic?.id);
  const isAdmin = activeClinic?.memberRole === "clinic_admin";
  const requests = useDoctorClinicLinkRequests(activeClinic?.id, isAdmin && !activeClinic.isSample);
  const [proposedScope, setProposedScope] = useState("");
  const scope = [user?.id, activeClinic?.id].join(":");
  const proposing = proposedScope === scope;

  // ClinicShell shows the loading / no-access states until a clinic is active.
  if (!activeClinic) return <ClinicShell title={title}>{null}</ClinicShell>;

  let content;
  if (links.isLoading) {
    content = <PageLoader label={t("clinicDoctors.loading")} />;
  } else if (links.error) {
    content = (
      <ErrorState
        title={t("clinicDoctors.loadError")}
        message={t(describeDataError(links.error))}
        onRetry={links.refetch}
      />
    );
  } else {
    const list = (links.data ?? [])
      .slice()
      .sort(
        (a, b) =>
          Number(b.active && b.state === "verified") - Number(a.active && a.state === "verified"),
      );
    const verified = list.filter((link) => link.active && link.state === "verified").length;
    content = (
      <div className="space-y-4">
        <div className="surface-card flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="flex min-w-0 items-center gap-3">
            <Stethoscope className="h-5 w-5 shrink-0 text-primary" aria-hidden />
            <h2 className="font-display font-semibold">{t("clinicWorkspace.roster")}</h2>
          </div>
          <p className="text-sm text-muted-foreground">
            {t("clinicWorkspace.rosterCount", { verified, total: list.length })}
          </p>
        </div>
        <InfoNotice className="text-sm">{t("clinicDoctors.verificationNote")}</InfoNotice>
        {list.length === 0 ? (
          <EmptyState
            icon={UserPlus}
            title={t("clinicDoctors.none")}
            {...(isAdmin ? { description: t("clinicDoctors.noneAdmin") } : {})}
          />
        ) : (
          <ul className="grid items-start gap-4 xl:grid-cols-2">
            {list.map((link) => (
              <DoctorLinkCard
                key={`${user?.id}:${activeClinic.id}:${link.doctorId}`}
                link={link}
                fee={doctors.find((d) => d.id === link.doctorId)?.consultationFee}
                clinicId={activeClinic.id}
                schedules={(schedules.data ?? []).filter((s) => s.doctorId === link.doctorId)}
                schedulesError={schedules.error}
                schedulesLoading={schedules.isLoading}
                retrySchedules={() => void schedules.refetch()}
                clinicBookingEnabled={
                  !activeClinic.isSample &&
                  activeClinic.verificationState === "verified" &&
                  activeClinic.isPublished &&
                  activeClinic.bookingEnabled
                }
              />
            ))}
          </ul>
        )}
        {isAdmin ? (
          proposing ? (
            <ProposeDoctorForm
              key={scope}
              clinicId={activeClinic.id}
              onDone={() => setProposedScope("")}
            />
          ) : (
            <Button
              variant="highlight"
              onClick={() => setProposedScope(scope)}
              className="h-auto min-h-10 whitespace-normal"
            >
              <UserPlus aria-hidden />
              {t("clinicDoctors.propose")}
            </Button>
          )
        ) : (
          <p className="text-sm text-muted-foreground">{t("clinicDoctors.adminOnly")}</p>
        )}
      </div>
    );
  }

  return (
    <ClinicShell title={title} description={subtitle}>
      <div className="space-y-5">
        {isAdmin && !activeClinic.isSample ? (
          <DoctorClinicLinkRequests
            key={`${user?.id}:${activeClinic.id}`}
            clinicId={activeClinic.id}
            query={requests}
          />
        ) : null}
        <div id="clinic-consultation-hours" tabIndex={-1} className="scroll-mt-28">
          {content}
        </div>
      </div>
    </ClinicShell>
  );
}

function DoctorLinkCard({
  link,
  fee,
  clinicId,
  schedules,
  schedulesError,
  schedulesLoading,
  retrySchedules,
  clinicBookingEnabled,
}: {
  link: DoctorLink;
  fee: number | undefined;
  clinicId: string;
  schedules: Schedule[];
  schedulesError: unknown;
  schedulesLoading: boolean;
  retrySchedules: () => void;
  clinicBookingEnabled: boolean;
}) {
  const { t, fmt } = useI18n();
  const [editingHours, setEditingHours] = useState(false);
  const canEditHours = link.active && link.state === "verified";
  const hoursKnown = !schedulesLoading && !schedulesError;
  const onlineBooking =
    canEditHours &&
    clinicBookingEnabled &&
    !link.isSample &&
    hoursKnown &&
    schedules.some((schedule) =>
      scheduleHasBookableWindow(schedule.startTime, schedule.endTime, schedule.slotMinutes),
    );

  return (
    <li className="surface-card p-5">
      <div className="flex gap-3">
        <Initials name={link.doctorName} className="h-12 w-12" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <h3 className="font-display font-semibold [overflow-wrap:anywhere]" dir="auto">
              {link.doctorName}
            </h3>
            <LinkStatus state={link.state} active={link.active} />
          </div>
          <p className="text-sm text-primary">{fmt.specialty(link.specialtyId)}</p>
          {link.qualifications.length > 0 ? (
            <p dir="auto" className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
              {link.qualifications.join(" · ")}
            </p>
          ) : null}
          {fee !== undefined ? (
            <p className="text-sm text-muted-foreground">
              {t("common.consultationFee", { fee: fmt.inr(fee) })}
            </p>
          ) : null}
        </div>
      </div>

      <p className="mt-3 text-sm">
        <span className="font-semibold">{t("clinicDoctors.onlineBooking")}: </span>
        {onlineBooking
          ? t("clinicWorkspace.bookingConfigured")
          : canEditHours && clinicBookingEnabled && !hoursKnown
            ? t(schedulesLoading ? "common.loading" : "clinicWorkspace.unavailable")
            : link.state === "rejected"
              ? t("clinicDoctors.rejectedNote")
              : link.state !== "verified"
                ? t("clinicDoctors.pending")
                : t("doctor.bookingUnavailable")}
      </p>

      {canEditHours ? (
        <div className="mt-4 border-t pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="flex items-center gap-1.5 text-sm font-semibold">
              <CalendarClock className="h-4 w-4 text-primary" aria-hidden />
              {t("schedule.title")}
            </h4>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setEditingHours((v) => !v)}
              aria-expanded={editingHours}
              className="h-auto min-h-9 whitespace-normal"
              disabled={schedulesLoading || !!schedulesError}
            >
              {editingHours ? t("schedule.done") : t("schedule.edit")}
            </Button>
          </div>
          {schedulesLoading ? (
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              {t("common.loading")}
            </p>
          ) : schedulesError ? (
            <div className="mt-2" role="alert">
              <p className="text-sm text-destructive">{t(describeDataError(schedulesError))}</p>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2"
                onClick={retrySchedules}
              >
                {t("common.tryAgain")}
              </Button>
            </div>
          ) : schedules.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">{t("schedule.none")}</p>
          ) : (
            <ul className="mt-2 space-y-1 text-sm">
              {schedules.map((s) => (
                <ScheduleRow key={s.id} schedule={s} clinicId={clinicId} editable={editingHours} />
              ))}
            </ul>
          )}
          {editingHours ? (
            <div hidden={schedulesLoading || !!schedulesError}>
              <ScheduleForm
                clinicId={clinicId}
                doctorId={link.doctorId}
                existing={schedules}
                disabled={schedulesLoading || !!schedulesError}
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ProposeDoctorForm({ clinicId, onDone }: { clinicId: string; onDone: () => void }) {
  const { t, fmt } = useI18n();
  const propose = useProposeDoctor();
  const [name, setName] = useState("");
  const [specialtyId, setSpecialtyId] = useState("general");
  const [gender, setGender] = useState<"" | "male" | "female" | "other">("");
  const [experience, setExperience] = useState("");
  const [fee, setFee] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [languages, setLanguages] = useState("");
  const [registration, setRegistration] = useState("");
  const [about, setAbout] = useState("");
  const [error, setError] = useState<string | null>(null);
  const list = (s: string) =>
    s
      .split(",")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 10);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const years = Number(experience);
    const amount = Number(fee);
    if (name.trim().length < 3) return setError(t("propose.error.name"));
    if (!experience || !Number.isInteger(years) || years < 0 || years > 70)
      return setError(t("propose.error.experience"));
    if (!fee || !(amount >= 0 && amount <= 100000)) return setError(t("propose.error.fee"));
    if (registration.trim().length < 5) return setError(t("propose.error.registration"));
    setError(null);
    try {
      await propose.mutateAsync({
        clinicId,
        name,
        specialtyId,
        gender: gender || null,
        experienceYears: years,
        consultationFee: amount,
        qualifications: list(qualifications),
        languages: list(languages),
        registrationNote: registration,
        about,
      });
      toast.success(t("propose.sent"));
      onDone();
    } catch (err) {
      setError(
        isNotDeployed(err)
          ? t("propose.notDeployed")
          : codeOf(err) === "P0001" && /Rate Limit/i.test(messageOf(err))
            ? t("propose.limit")
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
      onSubmit={submit}
      noValidate
      className="surface-card space-y-4 p-5"
      aria-labelledby="propose-title"
    >
      <div>
        <h2 id="propose-title" className="font-semibold">
          {t("propose.title")}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">{t("propose.help")}</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="p-name">
            {t("propose.name")}
            {required}
          </Label>
          <Input
            id="p-name"
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("propose.namePlaceholder")}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-specialty">
            {t("propose.specialty")}
            {required}
          </Label>
          <NativeSelect
            id="p-specialty"
            value={specialtyId}
            onChange={(e) => setSpecialtyId(e.target.value)}
          >
            {SPECIALTIES.map((s) => (
              <option key={s.id} value={s.id}>
                {fmt.specialty(s.id)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-gender">{t("details.gender")}</Label>
          <NativeSelect
            id="p-gender"
            value={gender}
            onChange={(e) => {
              const v = e.target.value;
              setGender(v === "male" || v === "female" || v === "other" ? v : "");
            }}
          >
            <option value="">{t("details.preferNotToSay")}</option>
            <option value="female">{t("common.female")}</option>
            <option value="male">{t("common.male")}</option>
            <option value="other">{t("common.other")}</option>
          </NativeSelect>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-exp">
            {t("propose.experience")}
            {required}
          </Label>
          <Input
            id="p-exp"
            type="number"
            inputMode="numeric"
            min={0}
            max={70}
            value={experience}
            onChange={(e) => setExperience(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-fee">
            {t("propose.fee")}
            {required}
          </Label>
          <Input
            id="p-fee"
            type="number"
            inputMode="numeric"
            min={0}
            max={100000}
            value={fee}
            onChange={(e) => setFee(e.target.value)}
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="p-reg">
            {t("propose.registration")}
            {required}
          </Label>
          <Input
            id="p-reg"
            maxLength={300}
            value={registration}
            onChange={(e) => setRegistration(e.target.value)}
            aria-describedby="p-reg-hint"
          />
          <p id="p-reg-hint" className="text-xs text-muted-foreground">
            {t("propose.registrationHint")}
          </p>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-qual">{t("propose.qualifications")}</Label>
          <Input
            id="p-qual"
            value={qualifications}
            onChange={(e) => setQualifications(e.target.value)}
            placeholder="MBBS, MD"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="p-lang">{t("propose.languages")}</Label>
          <Input
            id="p-lang"
            value={languages}
            onChange={(e) => setLanguages(e.target.value)}
            placeholder="Tamil, English"
          />
        </div>
        <div className="space-y-1.5 sm:col-span-2">
          <Label htmlFor="p-about">{t("propose.about")}</Label>
          <Textarea
            id="p-about"
            maxLength={1000}
            rows={3}
            value={about}
            onChange={(e) => setAbout(e.target.value)}
          />
        </div>
      </div>
      {error ? <FormAlert>{error}</FormAlert> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" variant="highlight" disabled={propose.isPending}>
          {propose.isPending ? <Loader2 className="animate-spin" aria-hidden /> : null}
          {t("propose.submit")}
        </Button>
        <Button type="button" variant="outline" onClick={onDone} disabled={propose.isPending}>
          {t("common.cancel")}
        </Button>
      </div>
    </form>
  );
}

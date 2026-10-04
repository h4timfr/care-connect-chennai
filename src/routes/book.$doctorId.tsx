import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { AlertCircle, ArrowLeft, Loader2, SearchX } from "lucide-react";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { PatientShell } from "@/components/layout/PatientShell";
import {
  EmptyState,
  ErrorState,
  InfoNotice,
  Initials,
  PageLoader,
  SampleBadge,
} from "@/components/common";
import { MissingProfile } from "@/components/MissingProfile";
import { DateStrip, SlotGrid } from "@/components/SlotPicker";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { isoDate } from "@/lib/format";
import { Trans, useI18n } from "@/lib/i18n";
import { useApp } from "@/lib/store";
import { SLOT_GONE_ERRORS, describeBookingError } from "@/lib/supabase/appointments";
import { describeDataError } from "@/lib/supabase/errors";
import { bookableClinicIds } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils";

interface BookSearch {
  date?: string | undefined;
  time?: string | undefined;
  clinicId?: string | undefined;
}

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/;

/** A real calendar date in yyyy-mm-dd form (rejects 2099-13-45, 2026-02-30, ...). */
function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}
const MAX_REASON_LENGTH = 500;

export const Route = createFileRoute("/book/$doctorId")({
  // TanStack Router merges validated values over the raw URL search, so a key left out here would
  // keep its raw, unvalidated value. Every key is therefore returned, as undefined when invalid.
  validateSearch: ({ date, time, clinicId }: Record<string, unknown>): BookSearch => ({
    date: typeof date === "string" && isCalendarDate(date) ? date : undefined,
    time: typeof time === "string" && TIME_PATTERN.test(time) ? time : undefined,
    clinicId: typeof clinicId === "string" && clinicId ? clinicId : undefined,
  }),
  head: () => ({ meta: [{ title: "Book an appointment — CareConnect" }] }),
  component: BookAppointment,
});

function BookAppointment() {
  const { doctorId } = Route.useParams();
  const search = Route.useSearch();
  const { loading: authLoading, user } = useProtectedRoute();
  const { doctorById, clinicById, patient, isLoadingPatient, patientError, catalog } = useApp();
  const { t, fmt } = useI18n();

  if (authLoading || !user) {
    return (
      <PatientShell>
        <PageLoader label={authLoading ? undefined : t("common.redirectingToSignIn")} />
      </PatientShell>
    );
  }

  const doctor = doctorById(doctorId);

  if (isLoadingPatient || (!doctor && catalog.isLoading)) {
    return (
      <PatientShell>
        <PageLoader />
      </PatientShell>
    );
  }

  if (patientError || (!doctor && catalog.error)) {
    return (
      <PatientShell>
        <ErrorState
          title={t("book.loadError")}
          message={t(describeDataError(patientError ?? catalog.error))}
          onRetry={catalog.refetch}
        />
      </PatientShell>
    );
  }

  if (!patient) {
    return (
      <PatientShell>
        <MissingProfile action="book" />
      </PatientShell>
    );
  }

  if (!doctor) {
    return (
      <PatientShell>
        <EmptyState
          icon={SearchX}
          title={t("doctor.notFoundTitle")}
          description={t("doctor.notFoundBody")}
          action={
            <Button asChild variant="outline" size="sm">
              <Link to="/discover">{t("common.findDoctors")}</Link>
            </Button>
          }
        />
      </PatientShell>
    );
  }

  const clinics = bookableClinicIds(doctor)
    .map((id) => clinicById(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));

  return (
    <PatientShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <Link
          to="/doctors/$doctorId"
          params={{ doctorId: doctor.id }}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />{" "}
          {t("book.backTo", { name: doctor.name })}
        </Link>

        <h1 className="font-display text-2xl font-bold">{t("book.title")}</h1>

        <section className="surface-card flex items-center gap-4 p-5">
          <Initials name={doctor.name} className="h-14 w-14 text-lg" />
          <div className="min-w-0">
            <p className="truncate font-display text-lg font-semibold">{doctor.name}</p>
            <p className="text-sm text-primary">{fmt.specialty(doctor.specialtyId)}</p>
            {doctor.isSample ? <SampleBadge className="mt-1" /> : null}
          </div>
        </section>

        {clinics.length ? (
          <BookingForm
            key={doctor.id}
            doctorId={doctor.id}
            fee={doctor.consultationFee}
            clinics={clinics}
            initial={search}
          />
        ) : (
          <InfoNotice className="text-sm">
            <Trans
              k="book.notAccepting"
              values={{
                name: doctor.name,
                link: (
                  <Link
                    to="/doctors/$doctorId"
                    params={{ doctorId: doctor.id }}
                    className="font-medium text-foreground underline underline-offset-2"
                  >
                    {t("book.doctorsProfile")}
                  </Link>
                ),
              }}
            />
          </InfoNotice>
        )}
      </div>
    </PatientShell>
  );
}

function BookingForm({
  doctorId,
  fee,
  clinics,
  initial,
}: {
  doctorId: string;
  fee: number;
  clinics: { id: string; name: string; address: string }[];
  initial: BookSearch;
}) {
  const navigate = useNavigate();
  const { bookAppointment } = useApp();
  const [clinicId, setClinicId] = useState(
    clinics.some((c) => c.id === initial.clinicId) ? initial.clinicId! : clinics[0]!.id,
  );
  const [date, setDate] = useState(initial.date ?? isoDate(new Date()));
  const [time, setTime] = useState(initial.time ?? "");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);
  const { t, fmt } = useI18n();

  const clinic = clinics.find((c) => c.id === clinicId);

  const selectClinic = (id: string) => {
    setClinicId(id);
    setTime("");
    setError(null);
  };
  const selectDate = (d: string) => {
    setDate(d);
    setTime("");
    setError(null);
  };

  const confirm = async () => {
    if (inFlight.current || !time) return;
    inFlight.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const appointment = await bookAppointment({
        doctorId,
        clinicId,
        date,
        time,
        reason: reason.trim(),
      });
      toast.success(t("book.requested"));
      // Replace the booking form in history: Back shouldn't return to a form for an
      // appointment that now exists.
      navigate({
        to: "/appointments/$appointmentId",
        params: { appointmentId: appointment.id },
        replace: true,
      });
    } catch (err) {
      const key = describeBookingError(err);
      setError(t(key));
      if (SLOT_GONE_ERRORS.includes(key)) setTime("");
    } finally {
      inFlight.current = false;
      setSubmitting(false);
    }
  };

  return (
    <>
      {clinics.length > 1 ? (
        <section className="surface-card space-y-3 p-5" aria-labelledby="clinic-heading">
          <h2 id="clinic-heading" className="font-medium">
            {t("book.clinic")}
          </h2>
          <div role="radiogroup" aria-labelledby="clinic-heading" className="grid gap-2">
            {clinics.map((c) => (
              <button
                key={c.id}
                type="button"
                role="radio"
                aria-checked={c.id === clinicId}
                onClick={() => selectClinic(c.id)}
                className={cn(
                  "rounded-lg border p-3 text-start text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  c.id === clinicId ? "border-primary bg-primary-soft/50" : "hover:bg-muted",
                )}
              >
                <span className="block font-medium">{c.name}</span>
                <span className="block text-muted-foreground">{c.address}</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="surface-card space-y-4 p-5" aria-labelledby="time-heading">
        <div>
          <h2 id="time-heading" className="font-medium">
            {t("book.dateTime")}
          </h2>
          {clinic && clinics.length === 1 ? (
            <p className="text-sm text-muted-foreground">
              {clinic.name} · {clinic.address}
            </p>
          ) : null}
        </div>
        <DateStrip value={date} onChange={selectDate} />
        <SlotGrid
          doctorId={doctorId}
          clinicId={clinicId}
          date={date}
          value={time}
          onChange={(t) => {
            setTime(t);
            setError(null);
          }}
        />
      </section>

      <section className="surface-card space-y-2 p-5">
        <Label htmlFor="reason">{t("book.reasonLabel")}</Label>
        <Textarea
          id="reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          maxLength={MAX_REASON_LENGTH}
          rows={3}
          placeholder={t("book.reasonPlaceholder")}
          aria-describedby="reason-hint"
        />
        <p id="reason-hint" className="text-xs text-muted-foreground">
          {t("book.reasonHint", { count: reason.length, max: MAX_REASON_LENGTH })}
        </p>
      </section>

      <section className="surface-card space-y-4 p-5" aria-labelledby="summary-heading">
        <h2 id="summary-heading" className="sr-only">
          {t("book.summary")}
        </h2>
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-muted-foreground">{t("book.when")}</dt>
            <dd className="font-medium">
              {time
                ? t("common.dateAtTime", { date: fmt.longDate(date), time: fmt.time(time) })
                : t("book.chooseTime")}
            </dd>
          </div>
          <div>
            <dt className="text-muted-foreground">{t("book.fee")}</dt>
            <dd className="font-medium">{fmt.inr(fee)}</dd>
          </div>
        </dl>

        {error ? (
          <div
            role="alert"
            className="flex gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
          >
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p>{error}</p>
          </div>
        ) : null}

        <Button size="lg" className="w-full" disabled={!time || submitting} onClick={confirm}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {submitting ? t("book.requesting") : t("book.request")}
        </Button>
        <p className="text-center text-xs text-muted-foreground">{t("book.noPayment")}</p>
      </section>
    </>
  );
}

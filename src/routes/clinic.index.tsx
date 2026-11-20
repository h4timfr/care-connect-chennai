import { pageTitles } from "@/lib/page-titles";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { ClinicOverview } from "@/components/clinic/ClinicOverview";
import { SetupChecklist, setupLinkClass, type SetupStep } from "@/components/SetupChecklist";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth";
import { isoDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { useDoctorClinicLinkRequests } from "@/lib/supabase/doctor-clinic-links";
import {
  scheduleHasBookableWindow,
  useClinicDoctorLinks,
  useClinicSchedules,
} from "@/lib/supabase/providers";
import type { MemberClinic } from "@/lib/supabase/queries";

export const Route = createFileRoute("/clinic/")({
  head: () => ({ meta: [{ title: pageTitles.clinic }] }),
  component: ClinicDashboard,
});

function ClinicDashboard() {
  const { activeClinic } = useApp();
  const { user } = useAuth();
  const now = new Date();
  const { t, fmt } = useI18n();

  return (
    <ClinicShell
      title={t("clinicDashboard.title")}
      description={t("clinicDashboard.overview", { date: fmt.shortDate(isoDate(now)) })}
    >
      {activeClinic && (
        <div key={[user?.id, activeClinic.id].join(":")} className="space-y-4">
          <ClinicOverview clinic={activeClinic} now={now} />
          {activeClinic.memberRole === "clinic_admin" && !activeClinic.isSample ? (
            <ClinicSetup clinic={activeClinic} />
          ) : null}
        </div>
      )}
    </ClinicShell>
  );
}

function ClinicSetup({ clinic }: { clinic: MemberClinic }) {
  const { t } = useI18n();
  const links = useClinicDoctorLinks(clinic.id);
  const requests = useDoctorClinicLinkRequests(clinic.id);
  const realLinks = links.error ? [] : (links.data ?? []).filter((link) => !link.isSample);
  const verified = new Set(
    realLinks
      .filter((link) => link.active && link.state === "verified")
      .map((link) => link.doctorId),
  );
  const activeRequests = requests.error ? [] : (requests.data ?? []);
  const requested = activeRequests.some((request) => request.status === "requested");
  const accepted = activeRequests.some((request) => request.status === "accepted");
  const proposed = realLinks.some((link) => link.active && link.state === "pending");
  const hasVerifiedDoctor = verified.size > 0;
  const recordedConsent = activeRequests.some(
    (request) => request.status === "verified" && verified.has(request.doctor_id),
  );
  const schedules = useClinicSchedules(hasVerifiedDoctor ? clinic.id : undefined);
  const verifiedHours = schedules.error
    ? []
    : (schedules.data ?? []).filter((schedule) => verified.has(schedule.doctorId));
  const hasBookableHours = verifiedHours.some((schedule) =>
    scheduleHasBookableWindow(schedule.startTime, schedule.endTime, schedule.slotMinutes),
  );
  const clinicVerified = clinic.verificationState === "verified";
  const published = clinicVerified && clinic.isPublished;
  const linkStatus = links.error || requests.error ? "unavailable" : "checking";
  const loadingLinks = links.isLoading || requests.isLoading;
  const bookingEnabled = published && hasBookableHours && clinic.bookingEnabled;
  const contactEnabled =
    published && hasVerifiedDoctor && clinic.patientContactPermission === "granted";
  const profile = (
    <Link to="/clinic/profile" className={setupLinkClass}>
      {t("clinicNav.profile")}
    </Link>
  );
  const doctors = (
    <Link to="/clinic/doctors" hash="clinic-link-requests" className={setupLinkClass}>
      {t("clinicNav.doctors")}
    </Link>
  );
  const steps: SetupStep[] = [
    {
      label: "setup.clinicVerification",
      state: clinicVerified
        ? "done"
        : clinic.verificationState === "rejected"
          ? "blocked"
          : "pending",
      ...(!clinicVerified
        ? { detail: `verification.${clinic.verificationState}` as const, link: profile }
        : {}),
    },
    {
      label: "setup.linkDoctor",
      state:
        hasVerifiedDoctor || accepted || proposed || requested
          ? "done"
          : loadingLinks || linkStatus === "unavailable"
            ? linkStatus
            : "action",
      ...(!hasVerifiedDoctor ? { link: doctors } : {}),
    },
    {
      label: "setup.doctorConsent",
      state: hasVerifiedDoctor
        ? recordedConsent
          ? "done"
          : requests.isLoading
            ? "checking"
            : "unavailable"
        : accepted || proposed || requested
          ? "pending"
          : loadingLinks || linkStatus === "unavailable"
            ? linkStatus
            : "blocked",
      ...(hasVerifiedDoctor && !recordedConsent && requests.isSuccess
        ? { detail: "setup.consentNotRecorded" }
        : accepted
          ? { detail: "verification.pending" }
          : requested
            ? { detail: "linkRequest.waiting" }
            : {}),
    },
    {
      label: "setup.hours",
      state:
        links.error || schedules.error
          ? "unavailable"
          : links.isLoading || schedules.isLoading
            ? "checking"
            : hasBookableHours
              ? "done"
              : hasVerifiedDoctor
                ? "action"
                : "blocked",
      ...(verifiedHours.length > 0 && !hasBookableHours ? { detail: "setup.hoursTooShort" } : {}),
      ...(hasVerifiedDoctor && !hasBookableHours
        ? {
            link: (
              <Link
                to="/clinic/doctors"
                hash="clinic-consultation-hours"
                className={setupLinkClass}
              >
                {t("setup.manageHours")}
              </Link>
            ),
          }
        : {}),
    },
    {
      label: "setup.onlineBooking",
      state: bookingEnabled
        ? "done"
        : links.error || schedules.error
          ? "unavailable"
          : links.isLoading || schedules.isLoading
            ? "checking"
            : hasBookableHours && clinicVerified
              ? "pending"
              : "blocked",
      ...(!bookingEnabled && hasBookableHours
        ? { detail: "setup.publishingHelp", link: profile }
        : {}),
    },
    {
      label: "setup.patientContact",
      state: contactEnabled
        ? "done"
        : links.error
          ? "unavailable"
          : links.isLoading
            ? "checking"
            : hasVerifiedDoctor && clinicVerified
              ? "pending"
              : "blocked",
      ...(!contactEnabled && hasVerifiedDoctor
        ? { detail: "setup.contactHelp", link: profile }
        : {}),
    },
  ];
  return <SetupChecklist title="setup.clinicTitle" steps={steps} />;
}

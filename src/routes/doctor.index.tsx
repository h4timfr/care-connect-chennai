import type { ReactNode } from "react";
import { pageTitles } from "@/lib/page-titles";
import { createFileRoute, Link } from "@tanstack/react-router";
import { DoctorOverview } from "@/components/doctor/DoctorOverview";
import { DoctorShell } from "@/components/layout/DoctorShell";
import { DoctorClinicLinkRequests } from "@/components/DoctorClinicLinkRequests";
import { SetupChecklist, setupLinkClass, type SetupStep } from "@/components/SetupChecklist";
import { EmptyState, ErrorState, InfoNotice, StatusBadge } from "@/components/common";
import { LinkStatus } from "@/components/ProviderStatus";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/supabase/auth";
import {
  useDoctorAppointments,
  useMyDoctorApplications,
  type MyDoctor,
} from "@/lib/supabase/doctor";
import { useDoctorClinicLinkRequests } from "@/lib/supabase/doctor-clinic-links";
import { describeDataError, isNotDeployed } from "@/lib/supabase/errors";
import { isAppointmentInPast } from "@/lib/appointment-time";

export const Route = createFileRoute("/doctor/")({
  head: () => ({ meta: [{ title: pageTitles.doctor }] }),
  component: DoctorDashboard,
});

function DoctorDashboard() {
  const { t } = useI18n();
  return (
    <DoctorShell
      title={t("doctorDashboard.title")}
      description={t("doctorDashboard.subtitle")}
      applicationProgress={(applications) => <DoctorSetup applications={applications} />}
    >
      {(me, tourOffer) => <Dashboard key={me.id} me={me} tourOffer={tourOffer} />}
    </DoctorShell>
  );
}

function DoctorSetup({
  me,
  requests,
  applications,
}: {
  me?: MyDoctor;
  requests?: ReturnType<typeof useDoctorClinicLinkRequests>;
  applications: ReturnType<typeof useMyDoctorApplications>;
}) {
  const { t } = useI18n();
  const list = applications.error ? [] : (applications.data ?? []);
  const application =
    list.find((entry) => entry.status === (me ? "approved" : "submitted")) ?? list[0];
  const verifiedLinks = me?.links.filter((link) => link.active && link.verified) ?? [];
  const verified = verifiedLinks.length > 0;
  const withHours = verifiedLinks.filter((link) => link.hasHours);
  const scheduled = withHours.length > 0;
  const usable = withHours.filter((link) => link.hasBookableHours);
  const ready = !me?.isSample && usable.some((link) => link.bookingEnabled === true);
  const publicationUnknown = usable.some((link) => link.bookingEnabled === undefined);
  const visibleRequests = requests?.error ? [] : (requests?.data ?? []);
  const accepted = visibleRequests.some(
    (request) => request.status === "accepted" || request.status === "verified",
  );
  const awaitingConsent = visibleRequests.some((request) => request.status === "requested");
  const awaitingVerification =
    visibleRequests.some((request) => request.status === "accepted") ||
    me?.links.some((link) => link.active && link.state === "pending");
  const applicationState = applications.error
    ? "unavailable"
    : applications.isLoading
      ? "checking"
      : application
        ? "done"
        : me
          ? "unavailable"
          : "action";

  const steps: SetupStep[] = [
    {
      label: "setup.application",
      state: applicationState,
      ...(application && !applications.error
        ? { detail: `apply.status.${application.status}` as const }
        : me && !applications.error && !applications.isLoading
          ? { detail: "setup.noApplication" }
          : {}),
      ...(!me && !applications.isLoading
        ? {
            link: (
              <Link to="/doctor/signup" className={setupLinkClass}>
                {t(application ? "setup.viewApplication" : "portal.doctor.register")}
              </Link>
            ),
          }
        : {}),
    },
    {
      label: "setup.profile",
      state: me
        ? "done"
        : applications.error
          ? "unavailable"
          : applications.isLoading
            ? "checking"
            : application?.status === "submitted"
              ? "pending"
              : "blocked",
    },
    {
      label: "setup.connectionAccepted",
      state: accepted
        ? "done"
        : !me
          ? "blocked"
          : requests?.error
            ? "unavailable"
            : requests?.isLoading
              ? "checking"
              : verified && !awaitingConsent
                ? "unavailable"
                : "action",
      ...(verified && !accepted && !awaitingConsent && requests?.isSuccess
        ? { detail: "setup.consentNotRecorded" }
        : {}),
      ...(me && !accepted && (!verified || awaitingConsent)
        ? {
            detail: awaitingConsent ? "setup.doctorRespond" : "setup.doctorRequest",
            link: (
              <a href="#doctor-link-requests" className={setupLinkClass}>
                {t("setup.viewRequests")}
              </a>
            ),
          }
        : {}),
    },
    {
      label: "setup.relationshipVerified",
      state: verified
        ? "done"
        : awaitingVerification
          ? "pending"
          : requests?.error
            ? "unavailable"
            : requests?.isLoading
              ? "checking"
              : "blocked",
    },
    {
      label: "setup.hours",
      state: usable.length ? "done" : verified ? "action" : "blocked",
      ...(scheduled && !usable.length ? { detail: "setup.hoursTooShort" } : {}),
      ...(verified && !usable.length
        ? {
            link: (
              <Link to="/doctor/schedule" className={setupLinkClass}>
                {t("doctorSchedule.title")}
              </Link>
            ),
          }
        : {}),
    },
    {
      label: "setup.ready",
      state: ready
        ? "done"
        : !usable.length || me?.isSample
          ? "blocked"
          : publicationUnknown
            ? "unavailable"
            : "pending",
      ...(usable.length > 0 && !ready && !me?.isSample ? { detail: "setup.publishingHelp" } : {}),
    },
  ];
  return <SetupChecklist title="setup.doctorTitle" steps={steps} />;
}

function Dashboard({ me, tourOffer }: { me: MyDoctor; tourOffer: ReactNode }) {
  const { user } = useAuth();
  const applications = useMyDoctorApplications(user?.id);
  const requests = useDoctorClinicLinkRequests();
  return (
    <div className="space-y-6">
      <DoctorOverview me={me} />
      {tourOffer}
      <DoctorSetup me={me} requests={requests} applications={applications} />
      <DoctorClinicLinkRequests key={me.id} doctorId={me.id} query={requests} />
    </div>
  );
}

import { pageTitles } from "@/lib/page-titles";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, LogOut } from "lucide-react";
import { PatientPageHeading, PatientShell } from "@/components/layout/PatientShell";
import { ErrorState, PageLoader } from "@/components/common";
import { AvatarEditor } from "@/components/AvatarEditor";
import { MissingProfile } from "@/components/MissingProfile";
import { PersonalDetailsCard } from "@/components/PersonalDetailsCard";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/supabase/auth";
import { describeDataError } from "@/lib/supabase/errors";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: pageTitles.patient }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const {
    patient,
    isLoadingPatient,
    patientError,
    refetchPatient,
    doctorById,
    catalog,
    memberClinics,
  } = useApp();
  const { signOut } = useAuth();
  const { loading, user } = useProtectedRoute();
  const navigate = useNavigate();
  const { t, fmt } = useI18n();

  if (loading || !user || isLoadingPatient) {
    return (
      <PatientShell compact>
        <PageLoader
          compact
          label={!loading && !user ? t("common.redirectingToSignIn") : t("profile.loading")}
        />
      </PatientShell>
    );
  }

  if (patientError) {
    return (
      <PatientShell compact>
        <ErrorState
          compact
          title={t("profile.loadError")}
          message={t(describeDataError(patientError))}
          onRetry={refetchPatient}
        />
      </PatientShell>
    );
  }

  if (!patient) {
    return (
      <PatientShell compact>
        <MissingProfile action="profile" />
      </PatientShell>
    );
  }

  const handleSignOut = async () => {
    if (await signOut()) navigate({ to: "/login" });
  };

  const savedDoctors = patient.savedDoctorIds
    .map((id) => doctorById(id))
    .filter((d): d is NonNullable<typeof d> => Boolean(d));

  return (
    <PatientShell compact>
      <div className="mx-auto max-w-5xl space-y-4">
        <PatientPageHeading title={t("profile.title")} description={t("profile.subtitle")} />

        <div className="grid items-start gap-4 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="min-w-0 space-y-4">
            <section
              className="space-y-3 rounded-xl border bg-card p-4 sm:p-5"
              aria-label={t("avatar.heading")}
            >
              <div className="min-w-0">
                <h2 className="font-display text-lg font-semibold [overflow-wrap:anywhere]">
                  {patient.name}
                </h2>
                <p className="text-sm text-muted-foreground [overflow-wrap:anywhere]">
                  <bdi dir="ltr">{patient.email}</bdi>
                </p>
              </div>
              <AvatarEditor name={patient.name || patient.email} />
            </section>

            <PersonalDetailsCard patient={patient} />
          </div>

          <div className="min-w-0 space-y-4">
            {memberClinics.length ? (
              <section
                className="space-y-2.5 rounded-xl border bg-card p-4"
                aria-labelledby="clinic-access-heading"
              >
                <h2 id="clinic-access-heading" className="flex items-center gap-2 font-medium">
                  <Building2 className="h-4 w-4" aria-hidden /> {t("profile.clinicAccess")}
                </h2>
                <p className="text-sm text-muted-foreground">
                  {t.plural("profile.clinicAccessBody", memberClinics.length)}
                </p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/clinic">{t("profile.openClinicPortal")}</Link>
                </Button>
              </section>
            ) : (
              <section
                className="space-y-2.5 rounded-xl border bg-card p-4"
                aria-labelledby="provider-heading"
              >
                <h2 id="provider-heading" className="flex items-center gap-2 font-medium">
                  <Building2 className="h-4 w-4 text-primary" aria-hidden />{" "}
                  {t("profile.providerTitle")}
                </h2>
                <p className="text-sm text-muted-foreground">{t("profile.providerBody")}</p>
                <div className="flex flex-wrap gap-2 [&>a]:h-auto [&>a]:min-h-8 [&>a]:max-w-full [&>a]:py-1.5 [&>a]:text-start [&>a]:whitespace-normal [&>a]:[overflow-wrap:anywhere]">
                  <Button asChild variant="outline" size="sm">
                    <Link to="/providers">{t("profile.providerLearn")}</Link>
                  </Button>
                  <Button asChild variant="soft" size="sm">
                    <Link to="/clinic/signup">{t("providerEntry.clinicRegister")}</Link>
                  </Button>
                  <Button asChild variant="soft" size="sm">
                    <Link to="/doctor/signup">{t("providerEntry.doctorRegister")}</Link>
                  </Button>
                </div>
              </section>
            )}

            <section
              className="space-y-2.5 rounded-xl border bg-card p-4"
              aria-labelledby="saved-heading"
            >
              <h2 id="saved-heading" className="font-medium">
                {t("profile.savedDoctors")}
              </h2>
              {catalog.error && patient.savedDoctorIds.length ? (
                <ErrorState
                  compact
                  title={t("profile.savedLoadError")}
                  message={t(describeDataError(catalog.error))}
                  onRetry={catalog.refetch}
                />
              ) : catalog.isLoading && patient.savedDoctorIds.length ? (
                <p className="text-sm text-muted-foreground">{t("profile.savedLoading")}</p>
              ) : savedDoctors.length ? (
                <ul className="divide-y">
                  {savedDoctors.map((d) => (
                    <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{d.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {fmt.specialty(d.specialtyId)}
                        </p>
                      </div>
                      <Button asChild variant="outline" size="sm">
                        <Link to="/doctors/$doctorId" params={{ doctorId: d.id }}>
                          {t("common.view")}
                        </Link>
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">{t("profile.noSaved")}</p>
              )}
            </section>

            <Button
              variant="outline"
              className="w-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden />
              {t("common.signOut")}
            </Button>
          </div>
        </div>
      </div>
    </PatientShell>
  );
}

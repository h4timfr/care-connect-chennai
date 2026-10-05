import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, LogOut } from "lucide-react";
import { PatientShell } from "@/components/layout/PatientShell";
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
  head: () => ({ meta: [{ title: "Your profile — CareConnect" }] }),
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
      <PatientShell>
        <PageLoader
          label={!loading && !user ? t("common.redirectingToSignIn") : t("profile.loading")}
        />
      </PatientShell>
    );
  }

  if (patientError) {
    return (
      <PatientShell>
        <ErrorState
          title={t("profile.loadError")}
          message={t(describeDataError(patientError))}
          onRetry={refetchPatient}
        />
      </PatientShell>
    );
  }

  if (!patient) {
    return (
      <PatientShell>
        <MissingProfile action="profile" />
      </PatientShell>
    );
  }

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  const savedDoctors = patient.savedDoctorIds
    .map((id) => doctorById(id))
    .filter((d): d is NonNullable<typeof d> => Boolean(d));

  return (
    <PatientShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">{t("profile.title")}</h1>
          <p className="text-sm text-muted-foreground">{t("profile.subtitle")}</p>
        </div>

        <section
          className="surface-card flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:items-start sm:text-start"
          aria-label={t("avatar.heading")}
        >
          <AvatarEditor name={patient.name || patient.email} />
          <div className="min-w-0 space-y-1 sm:pt-6">
            <h2 className="truncate font-display text-2xl font-bold">{patient.name}</h2>
            <p className="truncate text-muted-foreground" dir="ltr">
              {patient.email}
            </p>
          </div>
        </section>

        <PersonalDetailsCard patient={patient} />

        {memberClinics.length ? (
          <section className="surface-card space-y-3 p-6" aria-labelledby="clinic-access-heading">
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
          <section className="surface-card space-y-3 p-6" aria-labelledby="provider-heading">
            <h2 id="provider-heading" className="flex items-center gap-2 font-medium">
              <Building2 className="h-4 w-4 text-primary" aria-hidden />{" "}
              {t("profile.providerTitle")}
            </h2>
            <p className="text-sm text-muted-foreground">{t("profile.providerBody")}</p>
            <div className="flex flex-wrap gap-2">
              <Button asChild variant="outline" size="sm">
                <Link to="/providers">{t("profile.providerLearn")}</Link>
              </Button>
              <Button asChild variant="soft" size="sm">
                <Link to="/providers/apply">{t("providers.apply")}</Link>
              </Button>
            </div>
          </section>
        )}

        <section className="surface-card space-y-3 p-6" aria-labelledby="saved-heading">
          <h2 id="saved-heading" className="font-medium">
            {t("profile.savedDoctors")}
          </h2>
          {catalog.error && patient.savedDoctorIds.length ? (
            <ErrorState
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

        <section className="surface-card p-6">
          <Button
            variant="outline"
            className="w-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden />
            {t("common.signOut")}
          </Button>
        </section>
      </div>
    </PatientShell>
  );
}

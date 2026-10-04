import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { LogOut } from "lucide-react";
import { PatientShell } from "@/components/layout/PatientShell";
import { ErrorState, Initials, PageLoader } from "@/components/common";
import { MissingProfile } from "@/components/MissingProfile";
import { PersonalDetailsCard } from "@/components/PersonalDetailsCard";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { specialtyName } from "@/lib/format";
import { useAuth } from "@/lib/supabase/auth";
import { describeDataError } from "@/lib/supabase/errors";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";

export const Route = createFileRoute("/profile")({
  head: () => ({ meta: [{ title: "Your profile — CareConnect" }] }),
  component: ProfilePage,
});

function ProfilePage() {
  const { patient, isLoadingPatient, patientError, refetchPatient, doctorById } = useApp();
  const { signOut } = useAuth();
  const { loading, user } = useProtectedRoute();
  const navigate = useNavigate();

  if (loading || !user || isLoadingPatient) {
    return (
      <PatientShell>
        <PageLoader label={!loading && !user ? "Redirecting to sign in…" : "Loading profile…"} />
      </PatientShell>
    );
  }

  if (patientError) {
    return (
      <PatientShell>
        <ErrorState
          title="We couldn't load your profile"
          message={describeDataError(patientError)}
          onRetry={refetchPatient}
        />
      </PatientShell>
    );
  }

  if (!patient) {
    return (
      <PatientShell>
        <MissingProfile action="use patient features" />
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
          <h1 className="font-display text-2xl font-bold">Profile</h1>
          <p className="text-sm text-muted-foreground">Your CareConnect account details.</p>
        </div>

        <section className="surface-card flex flex-col items-center gap-5 p-6 text-center sm:flex-row sm:text-left">
          <Initials name={patient.name || patient.email} className="h-20 w-20 text-2xl" />
          <div className="min-w-0 space-y-1">
            <h2 className="truncate font-display text-2xl font-bold">{patient.name}</h2>
            <p className="truncate text-muted-foreground">{patient.email}</p>
          </div>
        </section>

        <PersonalDetailsCard patient={patient} />

        <section className="surface-card space-y-3 p-6" aria-labelledby="saved-heading">
          <h2 id="saved-heading" className="font-medium">
            Saved doctors
          </h2>
          {savedDoctors.length ? (
            <ul className="divide-y">
              {savedDoctors.map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-3 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{d.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {specialtyName(d.specialtyId)}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/doctors/$doctorId" params={{ doctorId: d.id }}>
                      View
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              You haven't saved any doctors yet. Use the bookmark icon on a doctor to save them.
            </p>
          )}
        </section>

        <section className="surface-card p-6">
          <Button
            variant="outline"
            className="w-full border-destructive/20 text-destructive hover:bg-destructive/10 hover:text-destructive"
            onClick={handleSignOut}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            Sign out
          </Button>
        </section>
      </div>
    </PatientShell>
  );
}

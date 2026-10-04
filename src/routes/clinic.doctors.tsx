import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { useApp } from "@/lib/store";
import { ErrorState, Initials, PageLoader } from "@/components/common";
import { describeDataError } from "@/lib/supabase/errors";
import { inr, pluralize, specialtyName } from "@/lib/format";

export const Route = createFileRoute("/clinic/doctors")({
  component: ClinicDoctors,
});

function ClinicDoctors() {
  const { doctors, activeClinic, catalog } = useApp();

  if (!activeClinic) return <ClinicShell title="Loading..." children={<div />} />;
  if (catalog.isLoading || catalog.error) {
    return (
      <ClinicShell title="Doctors" description="Doctors practising at your clinic">
        {catalog.error ? (
          <ErrorState
            title="We couldn't load doctors"
            message={describeDataError(catalog.error)}
            onRetry={catalog.refetch}
          />
        ) : (
          <PageLoader label="Loading doctors…" />
        )}
      </ClinicShell>
    );
  }

  const clinicDoctors = doctors.filter((d) => d.clinicIds?.includes(activeClinic.id));

  return (
    <ClinicShell title="Doctors" description="Doctors practising at your clinic">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clinicDoctors.map((d) => {
          const link = d.clinicLinks.find((l) => l.clinicId === activeClinic.id);
          return (
            <div key={d.id} className="surface-card p-5 space-y-4">
              <div className="flex gap-3">
                <Initials name={d.name} className="h-12 w-12" />
                <div>
                  <h3 className="font-display font-semibold">{d.name}</h3>
                  <p className="text-sm text-primary">{specialtyName(d.specialtyId)}</p>
                </div>
              </div>
              <div className="text-sm space-y-1 text-muted-foreground">
                <p>
                  <strong>Fee:</strong> {inr(d.consultationFee)}
                </p>
                <p>
                  <strong>Experience:</strong> {pluralize(d.experienceYears, "year")}
                </p>
                <p className="truncate">
                  <strong>Languages:</strong> {d.languages.join(", ")}
                </p>
                <p>
                  <strong>Online booking:</strong>{" "}
                  {link?.verified ? "Enabled" : "Pending CareConnect verification"}
                </p>
              </div>
            </div>
          );
        })}
        {clinicDoctors.length === 0 ? (
          <p className="text-sm text-muted-foreground">No doctors are linked to this clinic yet.</p>
        ) : null}
      </div>
    </ClinicShell>
  );
}

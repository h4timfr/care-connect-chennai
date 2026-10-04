import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { InfoNotice } from "@/components/common";
import { useApp } from "@/lib/store";
import { specialtyName } from "@/lib/format";

export const Route = createFileRoute("/clinic/profile")({
  component: ClinicProfileDetails,
});

function ClinicProfileDetails() {
  const { activeClinic } = useApp();

  if (!activeClinic) return <ClinicShell title="Loading..." children={<div />} />;

  const details: { label: string; value: string }[] = [
    { label: "Clinic name", value: activeClinic.name },
    { label: "Description", value: activeClinic.about },
    { label: "Address", value: activeClinic.address },
    { label: "Area", value: activeClinic.area },
    { label: "Phone", value: activeClinic.phone },
    { label: "Email", value: activeClinic.email },
    { label: "Specialties", value: activeClinic.specialtyIds.map(specialtyName).join(", ") },
  ];

  return (
    <ClinicShell title="Clinic Profile" description="How your clinic appears to patients">
      <div className="max-w-2xl space-y-4">
        <InfoNotice className="text-sm">
          Editing clinic details isn't available in the portal yet. This is the information patients
          currently see.
        </InfoNotice>
        <dl className="surface-card grid gap-4 p-6 text-sm">
          {details.map((d) => (
            <div key={d.label}>
              <dt className="text-muted-foreground">{d.label}</dt>
              <dd className={d.value ? "font-medium" : "text-muted-foreground"}>
                {d.value || "Not provided"}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </ClinicShell>
  );
}

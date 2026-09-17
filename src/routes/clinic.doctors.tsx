import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { useApp } from "@/lib/store";
import { UserPlus, MoreHorizontal } from "lucide-react";
import { Initials } from "@/components/common";
import { Button } from "@/components/ui/button";
import { specialtyName } from "@/data/mock";

export const Route = createFileRoute("/clinic/doctors")({
  component: ClinicDoctors,
});

function ClinicDoctors() {
  const { doctors, activeClinic } = useApp();

  const clinicDoctors = doctors.filter((d) => d.clinicId === activeClinic.id);

  return (
    <ClinicShell
      title="Doctors"
      description="Manage clinic doctors and their schedules"
      actions={
        <Button size="sm">
          <UserPlus className="h-4 w-4 mr-2" /> Add Doctor
        </Button>
      }
    >
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {clinicDoctors.map((d) => (
          <div key={d.id} className="surface-card p-5 space-y-4">
            <div className="flex justify-between items-start">
              <div className="flex gap-3">
                <Initials name={d.name} className="h-12 w-12" />
                <div>
                  <h3 className="font-display font-semibold">{d.name}</h3>
                  <p className="text-sm text-primary">{specialtyName(d.specialtyId)}</p>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-8 w-8 -mt-2 -mr-2">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </div>
            <div className="text-sm space-y-1 text-muted-foreground">
              <p>
                <strong>Fee:</strong> ₹{d.consultationFee}
              </p>
              <p>
                <strong>Experience:</strong> {d.experienceYears} years
              </p>
              <p className="truncate">
                <strong>Languages:</strong> {d.languages.join(", ")}
              </p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" size="sm" className="flex-1">
                Edit Profile
              </Button>
              <Button variant="outline" size="sm" className="flex-1">
                Schedule
              </Button>
            </div>
          </div>
        ))}
      </div>
    </ClinicShell>
  );
}

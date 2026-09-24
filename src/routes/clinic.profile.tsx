import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { useApp } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

export const Route = createFileRoute("/clinic/profile")({
  component: ClinicProfileSettings,
});

function ClinicProfileSettings() {
  const { loading, user } = useProtectedRoute();
  const { activeClinic } = useApp();

  if (!activeClinic) return <ClinicShell title="Loading..." children={<div />} />;

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    toast.error("Updating clinic profiles is not supported yet.");
  };

  return (
    <ClinicShell title="Clinic Profile" description="Update clinic information">
      <div className="max-w-2xl space-y-6">
        <form onSubmit={handleSave} className="surface-card p-6 space-y-6">
          <div className="space-y-4">
            <h2 className="font-display font-semibold text-lg border-b pb-2">Basic Information</h2>

            <div className="grid gap-4">
              <div>
                <label className="text-sm font-medium mb-1 block">Clinic Name</label>
                <Input defaultValue={activeClinic.name} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Description</label>
                <textarea
                  className="w-full bg-background border rounded-lg px-3 py-2 text-sm min-h-[100px]"
                  defaultValue={activeClinic.about}
                />
              </div>
            </div>
          </div>

          <div className="space-y-4 pt-4">
            <h2 className="font-display font-semibold text-lg border-b pb-2">Location</h2>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="text-sm font-medium mb-1 block">Street Address</label>
                <Input defaultValue={activeClinic.address} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Area</label>
                <Input defaultValue={activeClinic.area} />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">Coordinates (Lat, Lng)</label>
                <Input defaultValue={""} />
              </div>
            </div>
          </div>

          <div className="pt-4 flex justify-end">
            <Button type="submit">Save Changes</Button>
          </div>
        </form>
      </div>
    </ClinicShell>
  );
}

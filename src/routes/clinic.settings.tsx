import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Bell, Calendar, Shield } from "lucide-react";

export const Route = createFileRoute("/clinic/settings")({
  component: ClinicSettings,
});

function ClinicSettings() {
  const handleSave = () => {
    toast.success("Settings saved successfully");
  };

  return (
    <ClinicShell title="Settings" description="Application settings">
      <div className="max-w-2xl space-y-6">
         
         <div className="surface-card p-6 space-y-4">
            <h2 className="font-display font-semibold text-lg border-b pb-2 flex items-center gap-2">
               <Calendar className="h-5 w-5 text-muted-foreground" /> Appointment Rules
            </h2>
            <div className="space-y-4">
               <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1" defaultChecked />
                  <div>
                     <p className="font-medium text-sm">Auto-confirm appointments</p>
                     <p className="text-xs text-muted-foreground">Automatically confirm patient bookings without manual review.</p>
                  </div>
               </label>
               <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1" defaultChecked />
                  <div>
                     <p className="font-medium text-sm">Allow cancellations</p>
                     <p className="text-xs text-muted-foreground">Patients can cancel up to 2 hours before the scheduled time.</p>
                  </div>
               </label>
            </div>
         </div>

         <div className="surface-card p-6 space-y-4">
            <h2 className="font-display font-semibold text-lg border-b pb-2 flex items-center gap-2">
               <Bell className="h-5 w-5 text-muted-foreground" /> Notifications
            </h2>
            <div className="space-y-4">
               <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1" defaultChecked />
                  <div>
                     <p className="font-medium text-sm">New appointment alerts</p>
                     <p className="text-xs text-muted-foreground">Receive push notifications for new bookings.</p>
                  </div>
               </label>
               <label className="flex items-start gap-3">
                  <input type="checkbox" className="mt-1" defaultChecked />
                  <div>
                     <p className="font-medium text-sm">Daily summary</p>
                     <p className="text-xs text-muted-foreground">Receive an email summary of the day's schedule at 8 AM.</p>
                  </div>
               </label>
            </div>
         </div>

         <div className="surface-card p-6 space-y-4">
            <h2 className="font-display font-semibold text-lg border-b pb-2 flex items-center gap-2 text-destructive">
               <Shield className="h-5 w-5" /> Danger Zone
            </h2>
            <div className="space-y-3">
               <Button variant="outline" className="w-full sm:w-auto text-destructive border-destructive/20 hover:bg-destructive/10">
                  Deactivate Clinic Account
               </Button>
            </div>
         </div>

         <div className="flex justify-end pt-2">
            <Button onClick={handleSave}>Save Preferences</Button>
         </div>

      </div>
    </ClinicShell>
  );
}

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { User, Mail, Phone, MapPin, Globe, Shield, LogOut } from "lucide-react";
import { PatientShell } from "@/components/layout/PatientShell";
import { Initials } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { useAuth } from "@/lib/supabase/auth";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const { patient } = useApp();
  const { signOut, user } = useAuth();
  const navigate = useNavigate();

  const handleSignOut = async () => {
    await signOut();
    navigate({ to: "/login" });
  };

  return (
    <PatientShell>
      <div className="mx-auto max-w-2xl space-y-6">
        <div>
          <h1 className="font-display text-2xl font-bold">Profile</h1>
          <p className="text-sm text-muted-foreground">
            Manage your personal information and preferences.
          </p>
        </div>

        <div className="surface-card p-6 flex flex-col sm:flex-row items-center sm:items-start gap-6 text-center sm:text-left">
          <Initials name={patient.name} className="h-24 w-24 text-3xl" />
          <div className="flex-1 space-y-1">
            <h2 className="font-display text-2xl font-bold">{patient.name}</h2>
            <p className="text-muted-foreground">{patient.email}</p>
            <div className="pt-2 flex flex-wrap justify-center sm:justify-start gap-2">
              <Button variant="outline" size="sm">
                Edit Profile
              </Button>
            </div>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <section className="surface-card p-6 space-y-4">
            <h3 className="font-medium flex items-center gap-2">
              <User className="h-4 w-4" /> Personal Details
            </h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground mb-0.5">Phone</dt>
                <dd className="font-medium flex items-center gap-2">
                  <Phone className="h-3 w-3 text-muted-foreground" /> {patient.phone}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-0.5">Location</dt>
                <dd className="font-medium flex items-center gap-2">
                  <MapPin className="h-3 w-3 text-muted-foreground" /> {patient.area}
                </dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-0.5">Date of Birth</dt>
                <dd className="font-medium">
                  {new Date(patient.dateOfBirth).toLocaleDateString()}
                </dd>
              </div>
            </dl>
          </section>

          <section className="surface-card p-6 space-y-4">
            <h3 className="font-medium flex items-center gap-2">
              <Globe className="h-4 w-4" /> Preferences
            </h3>
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-muted-foreground mb-0.5">Language</dt>
                <dd className="font-medium">{patient.preferredLanguage}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground mb-0.5">Notifications</dt>
                <dd className="font-medium">SMS & Email</dd>
              </div>
            </dl>
          </section>
        </div>

        <section className="surface-card p-6 space-y-4">
          <h3 className="font-medium flex items-center gap-2 text-destructive">
            <Shield className="h-4 w-4" /> Account Actions
          </h3>
          {/* Action Buttons */}
          <div className="pt-4 flex flex-col gap-3">
            <Button
              variant="outline"
              className="w-full text-destructive hover:bg-destructive/10 hover:text-destructive border-destructive/20"
              onClick={handleSignOut}
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          </div>
        </section>
      </div>
    </PatientShell>
  );
}

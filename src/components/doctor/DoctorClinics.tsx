import { Building2 } from "lucide-react";
import { LinkStatus } from "@/components/ProviderStatus";
import { useI18n } from "@/lib/i18n";
import type { MyDoctor } from "@/lib/supabase/doctor";

export function DoctorClinics({ me, profile = false }: { me: MyDoctor; profile?: boolean }) {
  const { t } = useI18n();
  return (
    <section
      aria-labelledby="doctor-clinics"
      className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5"
    >
      <h2 id="doctor-clinics" className="flex items-start gap-2 font-display text-lg font-semibold">
        <Building2 className="mt-0.5 size-5 shrink-0 text-primary" aria-hidden />
        {t(profile ? "doctorProfile.clinicsTitle" : "doctorDashboard.clinics")}
      </h2>
      {profile ? (
        <p className="mt-1 text-sm text-muted-foreground">{t("doctorProfile.clinicsBody")}</p>
      ) : null}
      {me.links.length ? (
        <ul className="mt-2 divide-y">
          {me.links.map((link) => (
            <li
              key={link.clinicId}
              className="flex min-w-0 flex-wrap items-center justify-between gap-2 py-3"
            >
              <span className="min-w-0 text-sm font-medium [overflow-wrap:anywhere]">
                <bdi>{link.clinicName || t("common.notProvided")}</bdi>
              </span>
              <LinkStatus state={link.state} active={link.active} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-3 text-sm text-muted-foreground">{t("doctorDashboard.noClinics")}</p>
      )}
    </section>
  );
}

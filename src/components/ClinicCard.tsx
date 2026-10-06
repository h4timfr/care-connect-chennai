import { Link } from "@tanstack/react-router";
import { MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ListingStatus, Rating } from "@/components/common";
import { clinicHasBookableDoctor } from "@/lib/supabase/queries";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import type { Clinic } from "@/lib/types";

export function ClinicCard({ clinic }: { clinic: Clinic }) {
  const { doctorsOfClinic } = useApp();
  const clinicDoctors = doctorsOfClinic(clinic.id);
  const doctorCount = clinicDoctors.length;
  // "Verified" only when a doctor here is bookable (verified, active link); a clinic merely being
  // in the directory is not a verification.
  const bookable = clinicHasBookableDoctor(clinic.id, clinicDoctors);
  const [minFee, maxFee] = clinic.feeRange;
  const { t, fmt } = useI18n();

  return (
    <article className="surface-card flex flex-col overflow-hidden transition-[box-shadow,border-color] hover:border-primary/30 hover:shadow-raised">
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-semibold">
              <Link
                to="/clinics/$clinicId"
                params={{ clinicId: clinic.id }}
                className="hover:underline focus-visible:underline focus-visible:outline-none"
              >
                {clinic.name}
              </Link>
            </h3>
            {clinic.area ? (
              <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {clinic.area}
              </p>
            ) : null}
          </div>
          <Rating value={clinic.rating} count={clinic.reviewCount} sample={clinic.isSample} />
        </div>

        {clinic.specialtyIds.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label={t("common.specialties")}>
            {clinic.specialtyIds.map((id) => (
              <li
                key={id}
                className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
              >
                {fmt.specialty(id)}
              </li>
            ))}
          </ul>
        ) : null}

        <dl className="grid gap-1.5 text-sm text-muted-foreground">
          <div>
            <dt className="sr-only">{t("common.phone")}</dt>
            <dd className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate" dir="ltr">
                {clinic.phone}
              </span>
            </dd>
          </div>
          <div>
            <dt className="sr-only">{t("clinic.doctorsAndFees")}</dt>
            <dd>
              {t.plural("common.doctors", doctorCount)}
              {maxFee > 0
                ? ` · ${t("common.feeRange", { min: fmt.inr(minFee), max: fmt.inr(maxFee) })}`
                : ""}
            </dd>
          </div>
        </dl>

        <p className="truncate text-sm text-muted-foreground">{clinic.address}</p>
        <ListingStatus isSample={clinic.isSample} bookable={bookable} className="self-start" />

        <Button asChild className="mt-auto w-full" size="sm">
          <Link to="/clinics/$clinicId" params={{ clinicId: clinic.id }}>
            {t("clinic.viewClinic")}
          </Link>
        </Button>
      </div>
    </article>
  );
}

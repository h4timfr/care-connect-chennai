import { Link } from "@tanstack/react-router";
import { MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Rating, SampleBadge } from "@/components/common";
import { useApp } from "@/lib/store";
import { inr, specialtyName } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Clinic } from "@/lib/types";

export function ClinicCard({ clinic }: { clinic: Clinic }) {
  const { doctorsOfClinic } = useApp();
  const doctorCount = doctorsOfClinic(clinic.id).length;
  const [minFee, maxFee] = clinic.feeRange;

  return (
    <article className="surface-card flex flex-col overflow-hidden transition-shadow hover:shadow-pop">
      <div className={cn("h-20 bg-gradient-to-r", clinic.photoTone)} aria-hidden />
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
          <Rating value={clinic.rating} count={clinic.reviewCount} />
        </div>

        {clinic.specialtyIds.length ? (
          <ul className="flex flex-wrap gap-1.5" aria-label="Specialties">
            {clinic.specialtyIds.map((id) => (
              <li
                key={id}
                className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
              >
                {specialtyName(id)}
              </li>
            ))}
          </ul>
        ) : null}

        <dl className="grid gap-1.5 text-sm text-muted-foreground">
          <div>
            <dt className="sr-only">Phone</dt>
            <dd className="flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{clinic.phone}</span>
            </dd>
          </div>
          <div>
            <dt className="sr-only">Doctors and fees</dt>
            <dd>
              {doctorCount} {doctorCount === 1 ? "doctor" : "doctors"}
              {maxFee > 0 ? ` · ${inr(minFee)}–${inr(maxFee)}` : ""}
            </dd>
          </div>
        </dl>

        <p className="truncate text-sm text-muted-foreground">{clinic.address}</p>
        {clinic.isSample ? <SampleBadge className="self-start" /> : null}

        <Button asChild className="mt-auto w-full" size="sm">
          <Link to="/clinics/$clinicId" params={{ clinicId: clinic.id }}>
            View clinic
          </Link>
        </Button>
      </div>
    </article>
  );
}

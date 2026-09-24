import { Link } from "@tanstack/react-router";
import { Clock, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Rating } from "@/components/common";
import { useApp } from "@/lib/store";
import { specialtyName } from "@/lib/format";
import { inr, relativeDay, to12h } from "@/lib/format";
import type { Clinic } from "@/lib/types";

export function ClinicCard({ clinic }: { clinic: Clinic }) {
  const { doctorsOfClinic } = useApp();
  const doctors = doctorsOfClinic(clinic.id);
  const nextSlots = null; // Removed mock availability

  return (
    <article className="surface-card overflow-hidden transition-shadow hover:shadow-pop">
      <div className={`h-24 bg-gradient-to-r ${clinic.photoTone}`} aria-hidden />
      <div className="space-y-3 p-4 sm:p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-semibold">{clinic.name}</h3>
            <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {clinic.area}
            </p>
          </div>
          <Rating value={clinic.rating} count={clinic.reviewCount} />
        </div>

        <div className="flex flex-wrap gap-1.5">
          {clinic.specialtyIds.map((id) => (
            <span
              key={id}
              className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground"
            >
              {specialtyName(id)}
            </span>
          ))}
        </div>

        <dl className="grid gap-1.5 text-sm text-muted-foreground sm:grid-cols-2">
          <div className="flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{clinic.openingHours[0]?.hours}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Phone className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{clinic.phone}</span>
          </div>
          <div>
            {doctors.length} doctors · {inr(clinic.feeRange[0])}–{inr(clinic.feeRange[1])}
          </div>
          <div className="truncate">{clinic.services.slice(0, 2).join(", ")}</div>
        </dl>

        <p className="truncate text-sm text-muted-foreground">{clinic.address}</p>

        <Button asChild className="w-full" size="sm">
          <Link to="/clinics/$clinicId" params={{ clinicId: clinic.id }}>
            View clinic
          </Link>
        </Button>
      </div>
    </article>
  );
}

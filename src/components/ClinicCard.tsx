import { Link } from "@tanstack/react-router";
import { Clock, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Rating } from "@/components/common";
import { doctorsOfClinic, nextAvailable, specialtyName } from "@/data/mock";
import { inr, relativeDay, to12h } from "@/lib/format";
import type { Clinic } from "@/lib/types";

export function ClinicCard({ clinic }: { clinic: Clinic }) {
  const doctors = doctorsOfClinic(clinic.id);
  const nextSlots = doctors
    .map((d) => nextAvailable(d.id))
    .filter((n): n is { date: string; times: string[] } => Boolean(n))
    .sort((a, b) => a.date.localeCompare(b.date))[0];

  return (
    <article className="surface-card overflow-hidden transition-shadow hover:shadow-pop">
      <div className={`h-24 bg-gradient-to-r ${clinic.photoTone}`} aria-hidden />
      <div className="space-y-3 p-4 sm:p-5">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h3 className="truncate font-display text-base font-semibold">{clinic.name}</h3>
            <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {clinic.area} · {clinic.distanceKm} km
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

        <p className="rounded-lg bg-primary-soft/60 px-3 py-2 text-xs font-medium text-primary">
          {nextSlots
            ? `Next appointment ${relativeDay(nextSlots.date).toLowerCase()} at ${to12h(nextSlots.times[0] ?? "")}`
            : "No open appointments in the next 14 days"}
        </p>

        <Button asChild className="w-full" size="sm">
          <Link to="/clinics/$clinicId" params={{ clinicId: clinic.id }}>
            View clinic
          </Link>
        </Button>
      </div>
    </article>
  );
}

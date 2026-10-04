import { Link } from "@tanstack/react-router";
import { Bookmark, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Initials, Rating, SampleBadge } from "@/components/common";
import { inr, specialtyName } from "@/lib/format";
import { useApp } from "@/lib/store";
import { bookableClinicIds } from "@/lib/supabase/queries";
import { cn } from "@/lib/utils";
import type { Doctor } from "@/lib/types";

export function DoctorCard({ doctor, compact }: { doctor: Doctor; compact?: boolean }) {
  const { patient, toggleSavedDoctor, clinicById } = useApp();
  const clinic = clinicById(doctor.clinicIds[0] ?? "");
  const canBookOnline = bookableClinicIds(doctor).length > 0;
  const saved = patient?.savedDoctorIds.includes(doctor.id) ?? false;

  return (
    <article className="surface-card flex flex-col gap-4 p-4 transition-shadow hover:shadow-pop sm:p-5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <Initials name={doctor.name} className="h-12 w-12 text-base" />
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold">
            <Link
              to="/doctors/$doctorId"
              params={{ doctorId: doctor.id }}
              className="hover:underline focus-visible:underline focus-visible:outline-none"
            >
              {doctor.name}
            </Link>
          </h3>
          <p className="truncate text-sm text-primary">{specialtyName(doctor.specialtyId)}</p>
          {clinic ? (
            <p className="flex items-center gap-1 truncate text-sm text-muted-foreground">
              <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {clinic.name}
                {clinic.area ? ` · ${clinic.area}` : ""}
              </span>
            </p>
          ) : null}
        </div>
        {patient ? (
          <button
            type="button"
            onClick={() => toggleSavedDoctor(doctor.id)}
            aria-label={saved ? `Remove ${doctor.name} from saved doctors` : `Save ${doctor.name}`}
            aria-pressed={saved}
            className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Bookmark className={cn("h-4 w-4", saved && "fill-primary text-primary")} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{inr(doctor.consultationFee)}</span>
        <span>{doctor.experienceYears} yrs experience</span>
        <Rating value={doctor.rating} count={doctor.reviewCount} />
        {doctor.isSample ? <SampleBadge /> : null}
      </div>

      {!compact && doctor.languages.length ? (
        <p className="text-sm text-muted-foreground">
          <span className="sr-only">Languages: </span>
          {doctor.languages.join(" · ")}
        </p>
      ) : null}

      <div className="mt-auto grid grid-cols-2 gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/doctors/$doctorId" params={{ doctorId: doctor.id }}>
            View profile
          </Link>
        </Button>
        {canBookOnline ? (
          <Button asChild size="sm">
            <Link to="/book/$doctorId" params={{ doctorId: doctor.id }}>
              Book
            </Link>
          </Button>
        ) : (
          <p className="flex items-center justify-center rounded-md bg-muted px-2 text-center text-xs text-muted-foreground">
            Online booking unavailable
          </p>
        )}
      </div>
    </article>
  );
}

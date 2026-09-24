import { Link } from "@tanstack/react-router";
import { Bookmark, Clock, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Initials, Rating } from "@/components/common";
import { specialtyName } from "@/lib/format";
import { inr, relativeDay, to12h } from "@/lib/format";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import type { Doctor } from "@/lib/types";

export function DoctorCard({ doctor, compact }: { doctor: Doctor; compact?: boolean }) {
  const { patient, toggleSavedDoctor, clinicById } = useApp();
  const clinic = clinicById(doctor.clinicIds?.[0] || "");
  const next = null; // Removed mock availability
  const saved = patient?.savedDoctorIds?.includes(doctor.id) ?? false;

  return (
    <article className="surface-card flex flex-col gap-4 p-4 transition-shadow hover:shadow-pop sm:p-5">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
        <Initials name={doctor.name} className="h-12 w-12 text-base" />
        <div className="min-w-0">
          <h3 className="truncate font-display text-base font-semibold">{doctor.name}</h3>
          <p className="truncate text-sm text-primary">{specialtyName(doctor.specialtyId)}</p>
          <p className="truncate text-sm text-muted-foreground">
            {clinic?.name} · {clinic?.area}
          </p>
        </div>
        <button
          type="button"
          onClick={() => toggleSavedDoctor(doctor.id)}
          aria-label={saved ? "Remove from saved doctors" : "Save doctor"}
          aria-pressed={saved}
          className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <Bookmark className={cn("h-4 w-4", saved && "fill-primary text-primary")} aria-hidden />
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{inr(doctor.consultationFee)}</span>
        <span>{doctor.experienceYears} yrs experience</span>
        <span className="inline-flex items-center gap-1">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          Independent
        </span>
        <Rating value={doctor.rating} count={doctor.reviewCount} />
      </div>

      {!compact ? (
        <p className="text-sm text-muted-foreground">{doctor.languages.join(" · ")}</p>
      ) : null}

      <div className="rounded-lg bg-primary-soft/60 px-3 py-2.5">
        <p className="text-xs text-muted-foreground">No open slots in the next 14 days</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/doctors/$doctorId" params={{ doctorId: doctor.id }}>
            View profile
          </Link>
        </Button>
        <Button asChild size="sm">
          <Link to="/book/$doctorId" params={{ doctorId: doctor.id }}>
            Book
          </Link>
        </Button>
      </div>
    </article>
  );
}

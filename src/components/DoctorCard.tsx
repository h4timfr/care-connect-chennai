import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { Bookmark, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Initials, ListingStatus, Rating } from "@/components/common";
import { useApp } from "@/lib/store";
import { useI18n } from "@/lib/i18n";
import { bookableClinicIds, doctorCanPatientContact } from "@/lib/supabase/queries";
import { describeDataError } from "@/lib/supabase/errors";
import { cn } from "@/lib/utils";
import type { Doctor } from "@/lib/types";

export function DoctorCard({ doctor, compact }: { doctor: Doctor; compact?: boolean }) {
  const { patient, toggleSavedDoctor, clinicById } = useApp();
  const clinic = clinicById(doctor.clinicIds[0] ?? "");
  const canBookOnline = bookableClinicIds(doctor).length > 0;
  const saved = patient?.savedDoctorIds.includes(doctor.id) ?? false;
  const [saving, setSaving] = useState(false);
  const { t, fmt } = useI18n();

  const toggleSaved = async () => {
    setSaving(true);
    try {
      await toggleSavedDoctor(doctor.id);
    } catch (err) {
      toast.error(t("doctor.saveFailed", { reason: t(describeDataError(err)) }));
    } finally {
      setSaving(false);
    }
  };

  return (
    <article className="surface-card flex flex-col gap-4 p-4 transition-[box-shadow,border-color] hover:border-primary/30 hover:shadow-raised sm:p-5">
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
          <p className="truncate text-sm text-primary">{fmt.specialty(doctor.specialtyId)}</p>
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
            onClick={toggleSaved}
            disabled={saving}
            aria-label={
              saved
                ? t("doctor.unsave", { name: doctor.name })
                : t("doctor.save", { name: doctor.name })
            }
            aria-pressed={saved}
            className="shrink-0 rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <Bookmark className={cn("h-4 w-4", saved && "fill-primary text-primary")} aria-hidden />
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
        <span className="font-medium text-foreground">{fmt.inr(doctor.consultationFee)}</span>
        <span>{t.plural("common.experience", doctor.experienceYears)}</span>
        <Rating value={doctor.rating} count={doctor.reviewCount} sample={doctor.isSample} />
        <ListingStatus
          isSample={doctor.isSample}
          contactable={doctorCanPatientContact(doctor)}
          bookable={canBookOnline}
        />
      </div>

      {!compact && doctor.languages.length ? (
        <p className="text-sm text-muted-foreground">
          <span className="sr-only">{t("common.languages")}: </span>
          {doctor.languages.map(fmt.languageName).join(" · ")}
        </p>
      ) : null}

      <div className="mt-auto grid grid-cols-2 gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/doctors/$doctorId" params={{ doctorId: doctor.id }}>
            {t("doctor.viewProfile")}
          </Link>
        </Button>
        {canBookOnline ? (
          <Button asChild size="sm" variant="highlight">
            <Link to="/book/$doctorId" params={{ doctorId: doctor.id }}>
              {t("doctor.book")}
            </Link>
          </Button>
        ) : (
          <p className="flex items-center justify-center rounded-lg bg-muted px-2 text-center text-xs text-muted-foreground">
            {t("doctor.bookingUnavailable")}
          </p>
        )}
      </div>
    </article>
  );
}

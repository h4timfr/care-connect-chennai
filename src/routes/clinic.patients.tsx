import { createFileRoute } from "@tanstack/react-router";
import { Search, Users } from "lucide-react";
import { useMemo, useState } from "react";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { EmptyState, ErrorState, Initials, PageLoader } from "@/components/common";
import { Input } from "@/components/ui/input";
import { useApp } from "@/lib/store";
import { isoDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { describeStatusError } from "@/lib/supabase/appointments";
import type { Appointment } from "@/lib/types";

export const Route = createFileRoute("/clinic/patients")({
  component: ClinicPatients,
});

interface PatientSummary {
  id: string;
  name: string;
  appointments: Appointment[];
}

function ClinicPatients() {
  const { activeClinic, clinicAppointmentsStatus: status } = useApp();
  const { t } = useI18n();

  let body;
  if (!activeClinic) {
    body = null;
  } else if (status.isLoading) {
    body = <PageLoader label={t("clinicPatients.loading")} />;
  } else if (status.error) {
    body = (
      <ErrorState
        title={t("clinicPatients.loadError")}
        message={t(describeStatusError(status.error))}
        onRetry={status.refetch}
      />
    );
  } else {
    body = <PatientList clinicId={activeClinic.id} />;
  }

  return (
    <ClinicShell title={t("clinicPatients.title")} description={t("clinicPatients.subtitle")}>
      {body}
    </ClinicShell>
  );
}

function PatientList({ clinicId }: { clinicId: string }) {
  const { clinicAppointments } = useApp();
  const [search, setSearch] = useState("");
  const { t, fmt } = useI18n();

  const patients = useMemo(() => {
    const byId = new Map<string, PatientSummary>();
    for (const a of clinicAppointments) {
      if (a.clinicId !== clinicId) continue;
      const entry = byId.get(a.patientId) ?? {
        id: a.patientId,
        name: a.patientName || t("common.unknownPatient"),
        appointments: [],
      };
      entry.appointments.push(a);
      byId.set(a.patientId, entry);
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [clinicAppointments, clinicId, t]);

  const today = isoDate(new Date());
  const needle = search.trim().toLowerCase();
  const filtered = needle
    ? patients.filter((p) => p.name.toLowerCase().includes(needle))
    : patients;
  // One summary per patient, from this clinic's appointments only (RLS-scoped query).
  const rows = filtered.map((p) => ({
    id: p.id,
    name: p.name,
    count: p.appointments.length,
    lastVisit: p.appointments
      .filter((a) => a.status === "completed" || a.status === "arrived")
      .map((a) => a.date)
      .sort()
      .at(-1),
    next: p.appointments
      .filter((a) => (a.status === "pending" || a.status === "confirmed") && a.date >= today)
      .map((a) => a.date)
      .sort()[0],
  }));

  return (
    <div className="space-y-4">
      <div className="relative max-w-md">
        <Search className="absolute start-3 top-2.5 h-4 w-4 text-muted-foreground" aria-hidden />
        <label htmlFor="patient-search" className="sr-only">
          {t("clinicPatients.searchLabel")}
        </label>
        <Input
          id="patient-search"
          type="search"
          placeholder={t("clinicPatients.searchPlaceholder")}
          className="ps-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {patients.length === 0 ? (
        <EmptyState
          icon={Users}
          title={t("clinicPatients.noneYet")}
          description={t("clinicPatients.noneYetBody")}
        />
      ) : rows.length === 0 ? (
        <p className="surface-card p-8 text-center text-muted-foreground">
          {t("clinicPatients.noMatch")}
        </p>
      ) : (
        <>
          {/* Phones: one card per patient instead of a table that scrolls sideways. */}
          <ul className="space-y-3 md:hidden">
            {rows.map((r) => (
              <li key={r.id} className="surface-card p-4">
                <div className="flex items-center gap-3">
                  <Initials name={r.name} className="h-10 w-10 text-xs" />
                  <p className="min-w-0 font-medium [overflow-wrap:anywhere]" dir="auto">
                    {r.name}
                  </p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-2 text-xs [overflow-wrap:anywhere] min-[400px]:grid-cols-3">
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">
                      {t("clinicPatients.col.appointments")}
                    </dt>
                    <dd className="mt-0.5 text-sm font-medium">{fmt.number(r.count)}</dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">{t("clinicPatients.col.lastVisit")}</dt>
                    <dd className="mt-0.5 text-sm font-medium">
                      {r.lastVisit ? fmt.shortDate(r.lastVisit) : "—"}
                    </dd>
                  </div>
                  <div className="min-w-0">
                    <dt className="text-muted-foreground">{t("clinicPatients.col.next")}</dt>
                    <dd className="mt-0.5 text-sm font-medium">
                      {r.next ? fmt.shortDate(r.next) : "—"}
                    </dd>
                  </div>
                </dl>
              </li>
            ))}
          </ul>

          <div className="surface-card hidden overflow-x-auto md:block">
            <table className="w-full text-start text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th scope="col" className="p-4 text-start font-medium">
                    {t("clinicPatients.col.patient")}
                  </th>
                  <th scope="col" className="p-4 text-start font-medium">
                    {t("clinicPatients.col.appointments")}
                  </th>
                  <th scope="col" className="p-4 text-start font-medium">
                    {t("clinicPatients.col.lastVisit")}
                  </th>
                  <th scope="col" className="p-4 text-start font-medium">
                    {t("clinicPatients.col.next")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.id} className="transition-colors hover:bg-muted/30">
                    <td className="p-4">
                      <div className="flex items-center gap-3">
                        <Initials name={r.name} className="h-10 w-10 text-xs" />
                        <span className="font-medium" dir="auto">
                          {r.name}
                        </span>
                      </div>
                    </td>
                    <td className="p-4">{fmt.number(r.count)}</td>
                    <td className="p-4">{r.lastVisit ? fmt.shortDate(r.lastVisit) : "—"}</td>
                    <td className="p-4">{r.next ? fmt.shortDate(r.next) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

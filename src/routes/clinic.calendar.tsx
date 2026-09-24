import { createFileRoute } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import { CalendarRange, ChevronLeft, ChevronRight, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApp } from "@/lib/store";
import { useState } from "react";
import { isoDate, shortDate, to12h } from "@/lib/format";
import { StatusBadge } from "@/components/common";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/clinic/calendar")({
  component: ClinicCalendar,
});

function ClinicCalendar() {
  const { loading, user } = useProtectedRoute();
  const { clinicAppointments: appointments, activeClinic, doctors } = useApp();

  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDoctorId, setSelectedDoctorId] = useState<string>("all");

  if (!activeClinic) return <ClinicShell title="Loading..." children={<div />} />;

  const todayIso = isoDate(currentDate);

  const prevDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() - 1);
    setCurrentDate(d);
  };

  const nextDay = () => {
    const d = new Date(currentDate);
    d.setDate(d.getDate() + 1);
    setCurrentDate(d);
  };

  const clinicDoctors = doctors.filter((d) => d.clinicIds?.includes(activeClinic.id));
  const clinicAppointments = appointments.filter(
    (a) => a.clinicId === activeClinic.id && a.date === todayIso && a.status !== "cancelled",
  );

  const filteredAppointments =
    selectedDoctorId === "all"
      ? clinicAppointments
      : clinicAppointments.filter((a) => a.doctorId === selectedDoctorId);

  const hours = Array.from({ length: 11 }, (_, i) => i + 8); // 8 AM to 6 PM

  return (
    <ClinicShell
      title="Calendar"
      description="View and manage daily schedules"
      actions={
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setCurrentDate(new Date())}>
            Today
          </Button>
          <div className="flex items-center gap-1 border rounded-md">
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={prevDay}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium px-2">{shortDate(todayIso)}</span>
            <Button variant="ghost" size="icon" className="h-8 w-8 rounded-none" onClick={nextDay}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row gap-4 justify-between bg-card p-4 rounded-xl border">
          <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0">
            <Button
              variant={selectedDoctorId === "all" ? "default" : "outline"}
              size="sm"
              onClick={() => setSelectedDoctorId("all")}
            >
              All Doctors
            </Button>
            {clinicDoctors.map((d) => (
              <Button
                key={d.id}
                variant={selectedDoctorId === d.id ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedDoctorId(d.id)}
              >
                {d.name}
              </Button>
            ))}
          </div>
          <div className="relative shrink-0">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search patient..." className="pl-8 h-9" />
          </div>
        </div>

        <div className="surface-card overflow-hidden">
          <div className="grid grid-cols-[60px_1fr] border-b bg-muted/50">
            <div className="p-3 text-xs font-medium text-muted-foreground border-r text-center">
              Time
            </div>
            <div className="p-3 text-xs font-medium text-muted-foreground">Appointments</div>
          </div>
          <div className="divide-y relative min-h-[500px]">
            {hours.map((h) => {
              const hourAppointments = filteredAppointments.filter((a) => {
                const [aHour] = (a.time || "").split(":");
                return parseInt(aHour || "0") === h;
              });

              return (
                <div key={h} className="grid grid-cols-[60px_1fr] min-h-[80px]">
                  <div className="p-3 text-xs text-muted-foreground border-r text-right bg-muted/10">
                    {h > 12 ? `${h - 12} PM` : h === 12 ? "12 PM" : `${h} AM`}
                  </div>
                  <div className="p-2 flex flex-wrap gap-2 items-start relative">
                    {hourAppointments.map((a) => {
                      const doc = clinicDoctors.find((d) => d.id === a.doctorId);
                      return (
                        <div
                          key={a.id}
                          className="bg-background border rounded-lg p-2 text-sm w-full sm:w-[250px] shadow-sm flex flex-col gap-1 cursor-pointer hover:border-primary transition-colors"
                        >
                          <div className="flex justify-between items-start">
                            <span className="font-medium truncate pr-2">{a.patientName}</span>
                            <StatusBadge status={a.status} />
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {to12h(a.time)} • {doc?.name}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </ClinicShell>
  );
}

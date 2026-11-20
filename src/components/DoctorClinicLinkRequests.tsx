import { useId, useRef, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { FormAlert } from "@/components/AuthCard";
import { ErrorState, InfoNotice } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n, type MessageKey } from "@/lib/i18n";
import {
  type useDoctorClinicLinkRequests,
  useRequestDoctorClinicLink,
  useRespondDoctorClinicLink,
} from "@/lib/supabase/doctor-clinic-links";
import { codeOf, describeDataError, isNotDeployed } from "@/lib/supabase/errors";

const uuid = /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const wrapButton = "h-auto min-h-8 max-w-full py-1.5 whitespace-normal [overflow-wrap:anywhere]";
const statusLabels = new Map<string, MessageKey>([
  ["requested", "linkRequest.waiting"],
  ["accepted", "verification.pending"],
  ["verified", "verification.verified"],
  ["rejected", "verification.rejected"],
  ["inactive", "verification.inactive"],
  ["declined", "linkRequest.declined"],
  ["withdrawn", "linkRequest.withdrawn"],
]);

function requestError(error: unknown): MessageKey {
  switch (codeOf(error)) {
    case "22023":
      return "linkRequest.invalidDoctor";
    case "23505":
      return "linkRequest.duplicate";
    case "55000":
      return "linkRequest.answered";
    default:
      return describeDataError(error);
  }
}

export function DoctorClinicLinkRequests({
  clinicId,
  doctorId,
  query,
}: ({ clinicId: string; doctorId?: never } | { doctorId: string; clinicId?: never }) & {
  query: ReturnType<typeof useDoctorClinicLinkRequests>;
}) {
  const { t } = useI18n();
  const headingId = useId();
  const profileId = useId();
  const queryClient = useQueryClient();
  const request = useRequestDoctorClinicLink();
  const respond = useRespondDoctorClinicLink();
  const inFlight = useRef(false);
  const [target, setTarget] = useState("");
  const [error, setError] = useState<MessageKey | null>(null);
  const busy = request.isPending || respond.isPending;

  function refreshRequests() {
    void query.refetch();
    void queryClient.invalidateQueries({
      queryKey: clinicId ? ["clinic_doctors", "clinic", clinicId] : ["my_doctor"],
    });
  }

  async function submit(action: () => Promise<void>) {
    if (inFlight.current) return;
    inFlight.current = true;
    setError(null);
    try {
      await action();
    } catch (problem) {
      setError(requestError(problem));
    } finally {
      inFlight.current = false;
    }
  }

  function sendRequest(event: FormEvent) {
    event.preventDefault();
    const id = target.trim();
    if (!clinicId || inFlight.current) return;
    if (!uuid.test(id)) {
      setError("linkRequest.invalidId");
      return;
    }
    void submit(async () => {
      await request.mutateAsync({ clinicId, doctorId: id });
      setTarget("");
    });
  }

  return (
    <section
      id={clinicId ? "clinic-link-requests" : "doctor-link-requests"}
      data-tour-target={clinicId ? undefined : "doctor-link-requests"}
      tabIndex={-1}
      aria-labelledby={headingId}
      className="surface-card min-w-0 scroll-mt-28 space-y-3 p-4 sm:p-5"
    >
      <h2 id={headingId} className="font-semibold">
        {t(clinicId ? "linkRequest.linkDoctor" : "linkRequest.linkClinic")}
      </h2>
      {query.isLoading ? (
        <p role="status" className="text-sm text-muted-foreground">
          {t("common.loading")}
        </p>
      ) : query.error ? (
        isNotDeployed(query.error) ? (
          <InfoNotice>{t("linkRequest.unavailable")}</InfoNotice>
        ) : (
          <ErrorState
            compact
            title={t("linkRequest.loadError")}
            message={t(describeDataError(query.error))}
            onRetry={() => void query.refetch()}
          />
        )
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {t(clinicId ? "linkRequest.clinicHelp" : "linkRequest.doctorHelp")}
          </p>
          {clinicId ? (
            <form onSubmit={sendRequest} className="space-y-1.5">
              <Label htmlFor={profileId}>{t("linkRequest.profileId")}</Label>
              <div className="flex flex-wrap items-start gap-2">
                <Input
                  id={profileId}
                  value={target}
                  onChange={(event) => setTarget(event.target.value)}
                  disabled={busy}
                  autoComplete="off"
                  spellCheck={false}
                  dir="ltr"
                  className="min-w-0 flex-[1_1_15rem] sm:max-w-sm"
                  required
                />
                <Button type="submit" className={wrapButton} disabled={busy || !target.trim()}>
                  {t("linkRequest.send")}
                </Button>
              </div>
            </form>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor={profileId}>{t("linkRequest.profileId")}</Label>
              <Input
                id={profileId}
                value={doctorId}
                readOnly
                dir="ltr"
                className="max-w-sm font-mono"
              />
            </div>
          )}
          {error ? <FormAlert>{t(error)}</FormAlert> : null}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-semibold">{t("linkRequest.title")}</h3>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className={wrapButton}
              disabled={busy || query.isFetching}
              onClick={refreshRequests}
            >
              {t("linkRequest.refresh")}
            </Button>
          </div>
          {query.data?.length ? (
            <ul className="divide-y border-t" aria-live="polite">
              {query.data.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium [overflow-wrap:anywhere]" dir="auto">
                      {clinicId ? (item.doctor_name ?? item.doctor_id) : item.clinic_name}
                    </p>
                    <p className="text-sm text-muted-foreground">
                      {t(statusLabels.get(item.status) ?? "linkRequest.unavailable")}
                    </p>
                  </div>
                  {item.status === "requested" ? (
                    <div className="flex flex-wrap gap-2">
                      {clinicId ? (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className={wrapButton}
                          disabled={busy}
                          onClick={() =>
                            void submit(() =>
                              respond.mutateAsync({ p_request_id: item.id, p_action: "withdraw" }),
                            )
                          }
                        >
                          {t("linkRequest.withdraw")}
                        </Button>
                      ) : (
                        <>
                          <Button
                            type="button"
                            size="sm"
                            className={wrapButton}
                            disabled={busy}
                            onClick={() =>
                              void submit(() =>
                                respond.mutateAsync({ p_request_id: item.id, p_action: "accept" }),
                              )
                            }
                          >
                            {t("linkRequest.accept")}
                          </Button>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className={wrapButton}
                            disabled={busy}
                            onClick={() =>
                              void submit(() =>
                                respond.mutateAsync({ p_request_id: item.id, p_action: "decline" }),
                              )
                            }
                          >
                            {t("linkRequest.decline")}
                          </Button>
                        </>
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">{t("linkRequest.empty")}</p>
          )}
        </>
      )}
    </section>
  );
}

import { pageTitles } from "@/lib/page-titles";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MessageSquare, Send } from "lucide-react";
import { useEffect, useRef, type FormEvent } from "react";
import { useMessageDraft } from "@/hooks/useMessageDraft";
import { toast } from "@/lib/toast";
import { PatientPageHeading, PatientShell } from "@/components/layout/PatientShell";
import { EmptyState, ErrorState, Initials, PageLoader } from "@/components/common";
import { MissingProfile } from "@/components/MissingProfile";
import { CatalogNotice } from "@/components/CatalogNotice";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { describeDataError, isNetworkError } from "@/lib/supabase/errors";
import {
  usePrivateDoctorInbox,
  useSendPrivateDoctorMessage,
} from "@/lib/supabase/private-doctor-messaging";
import { isoDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { useProtectedRoute } from "@/hooks/useProtectedRoute";
import type { Conversation } from "@/lib/types";

export const Route = createFileRoute("/messages")({
  // Returned explicitly so an invalid raw ?c= can't survive TanStack's merge with the URL.
  validateSearch: ({ c }: Record<string, unknown>): { c?: string | undefined } => ({
    c: typeof c === "string" && c ? c : undefined,
  }),
  head: () => ({ meta: [{ title: pageTitles.messages }] }),
  component: MessagesView,
});

const MAX_MESSAGE_LENGTH = 2000;

const lastSentAt = (c: Conversation) => c.messages[c.messages.length - 1]?.sentAt ?? "";

function MessagesView() {
  const {
    conversations,
    conversationsStatus: status,
    patient,
    isLoadingPatient,
    patientError,
    refetchPatient,
  } = useApp();
  const { loading, user } = useProtectedRoute();
  const { t } = useI18n();
  const { c: requestedId } = Route.useSearch();
  const privateInbox = usePrivateDoctorInbox(false, !!user && !patientError);
  const clinicThreads = status.error ? [] : conversations;
  const privateThreads = privateInbox.error ? [] : (privateInbox.data ?? []);
  const allThreads = [...clinicThreads, ...privateThreads].filter(
    (c) => c.patientId === patient?.id,
  );
  // A conversation that was just started can be newer than the cached list: wait for the
  // refetch rather than briefly claiming the inbox is empty or the conversation unavailable.
  const awaitingRequested =
    !!requestedId &&
    (requestedId.startsWith("doctor:") ? privateInbox.isFetching : status.isFetching) &&
    !allThreads.some((c) => c.id === requestedId);

  let body;
  if (
    loading ||
    !user ||
    isLoadingPatient ||
    (allThreads.length === 0 && (status.isLoading || privateInbox.isLoading)) ||
    awaitingRequested
  ) {
    body = <PageLoader compact label={t("messages.loading")} />;
  } else if (patientError) {
    body = (
      <ErrorState
        compact
        title={t("messages.loadError")}
        message={t(describeDataError(patientError))}
        onRetry={refetchPatient}
      />
    );
  } else if (!patient) {
    body = <MissingProfile action="messages" />;
  }

  return (
    <PatientShell compact>
      <div className="space-y-4">
        <PatientPageHeading title={t("messages.title")} />
        <CatalogNotice />
        {body}
        {status.error && !patientError ? (
          <ErrorState
            compact
            title={t("messages.loadError")}
            message={t(describeDataError(status.error))}
            onRetry={status.refetch}
          />
        ) : null}
        {privateInbox.error && !patientError ? (
          <ErrorState
            compact
            title={t("messages.doctorLoadError")}
            message={t(describeDataError(privateInbox.error))}
            onRetry={() => void privateInbox.refetch()}
          />
        ) : null}
        {user && patient && !patientError ? (
          <Inbox
            key={`${user.id}:${patient.id}`}
            conversations={allThreads.sort((a, b) => lastSentAt(b).localeCompare(lastSentAt(a)))}
            suspended={
              !!body || (!!(status.error || privateInbox.error) && allThreads.length === 0)
            }
          />
        ) : null}
      </div>
    </PatientShell>
  );
}

function Inbox({
  conversations,
  suspended,
}: {
  conversations: Conversation[];
  suspended: boolean;
}) {
  const { sendMessage, clinicById } = useApp();
  const privateReply = useSendPrivateDoctorMessage();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/messages" });
  const endRef = useRef<HTMLDivElement>(null);
  const { t, fmt } = useI18n();

  const active = search.c ? conversations.find((c) => c.id === search.c) : undefined;
  const activeId = active?.id;
  const { text, setText, sending, send } = useMessageDraft(suspended ? undefined : activeId);
  const activeMessageCount = active?.messages.length ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [activeId, activeMessageCount]);

  const nameOf = (c: Conversation) =>
    c.kind === "doctor_appointment"
      ? (c.doctorName ?? t("common.doctor"))
      : (clinicById(c.clinicId)?.name ?? t("common.clinic"));
  const titleOf = (c: Conversation) => {
    const subject =
      c.kind === "general"
        ? t("messages.general")
        : c.appointmentDate
          ? t("messages.appointmentOn", { date: fmt.shortDate(c.appointmentDate) })
          : t("messages.aboutAppointment");
    return `${nameOf(c)} · ${subject}`;
  };

  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!active || active.canSend === false) return;
    await send(
      (body, id) =>
        active.kind === "doctor_appointment" && active.appointmentId
          ? privateReply.mutateAsync({ appointmentId: active.appointmentId, body, messageId: id })
          : sendMessage(active.id, body, id),
      (err) =>
        isNetworkError(err)
          ? t("messages.deliveryUnconfirmed")
          : t("messages.notSent", { reason: t(describeDataError(err)) }),
      toast.error,
    );
  };

  if (suspended) return null;
  if (!conversations.length) {
    return (
      <EmptyState
        compact
        icon={MessageSquare}
        title={t("messages.emptyTitle")}
        description={t("messages.emptyBody")}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            <Button asChild size="sm">
              <Link to="/appointments">{t("nav.appointments")}</Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/discover">{t("common.findDoctors")}</Link>
            </Button>
          </div>
        }
      />
    );
  }

  return (
    <div className="grid h-[calc(100dvh-12rem)] min-h-80 overflow-hidden rounded-xl border bg-card md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:h-[calc(100dvh-13rem)] lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-col bg-muted/20 md:border-e",
          active ? "hidden md:flex" : "flex",
        )}
      >
        <ul
          className="flex-1 divide-y overflow-y-auto overscroll-contain"
          aria-label={t("messages.conversations")}
        >
          {conversations.map((c) => {
            const last = c.messages[c.messages.length - 1];
            const title = titleOf(c);
            const isActive = c.id === activeId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => navigate({ search: { c: c.id } })}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-3 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    isActive ? "bg-primary-soft/50" : "hover:bg-muted/50",
                  )}
                >
                  <span className="relative shrink-0">
                    <Initials name={nameOf(c)} className="size-9 text-xs" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-0.5 flex items-baseline justify-between gap-2">
                      <span className="min-w-0 break-words text-sm font-medium">{title}</span>
                      {last ? (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {fmt.shortDate(isoDate(new Date(last.sentAt)))}
                        </span>
                      ) : null}
                    </span>
                    <span
                      className={cn(
                        "block text-xs font-medium",
                        c.kind === "doctor_appointment" ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {t(
                        c.kind === "doctor_appointment"
                          ? "messages.privateDoctor"
                          : "messages.clinicThread",
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground" dir="auto">
                      {last
                        ? last.sender === "patient"
                          ? t("common.youPrefix", { text: last.body })
                          : last.body
                        : t("messages.noMessages")}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div
        className={cn(
          "min-h-0 min-w-0 flex-col bg-background/50",
          active ? "flex" : "hidden md:flex",
        )}
      >
        {active ? (
          <>
            <div className="flex items-center gap-2.5 border-b bg-card px-3 py-2.5">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => navigate({ search: {} })}
                aria-label={t("messages.back")}
              >
                <ArrowLeft className="h-5 w-5 rtl:rotate-180" aria-hidden />
              </Button>
              <Initials name={nameOf(active)} className="h-9 w-9 text-xs" />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{titleOf(active)}</h2>
                <p className="truncate text-xs text-muted-foreground">
                  {active.kind === "doctor_appointment"
                    ? t("messages.privateDoctor")
                    : t("common.clinic")}
                </p>
              </div>
            </div>

            <div
              className="flex-1 space-y-3 overflow-y-auto overscroll-contain p-3 sm:p-4"
              aria-live="polite"
            >
              <p className="text-center">
                <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t(
                    active.kind === "doctor_appointment"
                      ? "messages.doctorNonEmergency"
                      : "messages.notForEmergencies",
                  )}
                </span>
              </p>
              {active.messages.length ? (
                active.messages.map((m) => {
                  const isMe = m.sender === "patient";
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex max-w-[80%] flex-col",
                        isMe ? "ms-auto items-end" : "me-auto items-start",
                      )}
                    >
                      <div
                        className={cn(
                          "rounded-xl px-3 py-2 text-start text-sm whitespace-pre-wrap [overflow-wrap:anywhere]",
                          isMe
                            ? "rounded-se-sm bg-primary text-primary-foreground"
                            : "rounded-ss-sm bg-muted text-foreground",
                        )}
                      >
                        <span className="sr-only">
                          {t(
                            isMe
                              ? "messages.senderYou"
                              : m.sender === "doctor"
                                ? "messages.senderDoctor"
                                : "messages.senderClinic",
                          )}{" "}
                        </span>
                        <span dir="auto">{m.body}</span>
                      </div>
                      <span className="mx-1 mt-1 text-[10px] text-muted-foreground">
                        {fmt.shortDate(isoDate(new Date(m.sentAt)))}, {fmt.clockTime(m.sentAt)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="pt-3 text-center text-sm text-muted-foreground">
                  {t(
                    active.canSend === false
                      ? "messages.noMessages"
                      : active.kind === "doctor_appointment"
                        ? "messages.doctorWriteBelow"
                        : "messages.writeBelow",
                  )}
                </p>
              )}
              <div ref={endRef} />
            </div>

            {active.canSend === false ? (
              <p className="border-t bg-card p-3 text-sm text-muted-foreground">
                {t("messages.doctorClosed")}
              </p>
            ) : (
              <form onSubmit={handleSend} className="border-t bg-card p-2.5 sm:p-3">
                <div className="flex items-end gap-2 rounded-xl border bg-muted/50 p-1 transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
                  <label htmlFor="message-input" className="sr-only">
                    {t("messages.inputLabel")}
                  </label>
                  <textarea
                    id="message-input"
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder={t("messages.placeholder")}
                    maxLength={MAX_MESSAGE_LENGTH}
                    className="max-h-32 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void handleSend();
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="mb-0.5 me-0.5 h-9 w-9 shrink-0 rounded-lg"
                    disabled={!text.trim() || sending}
                    aria-label={t("messages.send")}
                  >
                    {sending ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                    ) : (
                      <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
                    )}
                  </Button>
                </div>
              </form>
            )}
          </>
        ) : (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center text-muted-foreground">
            <MessageSquare className="h-12 w-12 opacity-20" aria-hidden />
            <p>{search.c ? t("messages.unavailable") : t("messages.select")}</p>
          </div>
        )}
      </div>
    </div>
  );
}

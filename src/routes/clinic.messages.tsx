import { pageTitles } from "@/lib/page-titles";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MessageSquare, Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMessageDraft } from "@/hooks/useMessageDraft";
import { useAuth } from "@/lib/supabase/auth";
import { toast } from "@/lib/toast";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { ErrorState, Initials, PageLoader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { isoDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { describeDataError, isNetworkError } from "@/lib/supabase/errors";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/types";

export const Route = createFileRoute("/clinic/messages")({
  head: () => ({ meta: [{ title: pageTitles.messages }] }),
  // Returned explicitly so an invalid raw ?c= can't survive TanStack's merge with the URL.
  validateSearch: ({ c }: Record<string, unknown>): { c?: string | undefined } => ({
    c: typeof c === "string" && c ? c : undefined,
  }),
  component: ClinicMessages,
});

const MAX_MESSAGE_LENGTH = 2000;
const lastSentAt = (c: Conversation) => c.messages[c.messages.length - 1]?.sentAt ?? "";

function ClinicMessages() {
  const { user } = useAuth();
  const { conversations, conversationsStatus: status, activeClinic } = useApp();
  const { t } = useI18n();
  const { c: requestedId } = Route.useSearch();
  const awaitingRequested =
    !!requestedId && status.isFetching && !conversations.some((c) => c.id === requestedId);

  let body;
  if (!activeClinic) {
    body = null; // ClinicShell renders the loading / access states.
  } else if (status.isLoading || awaitingRequested) {
    body = <PageLoader label={t("messages.loading")} />;
  } else if (status.error) {
    body = (
      <ErrorState
        title={t("clinicMessages.loadError")}
        message={t(describeDataError(status.error))}
        onRetry={status.refetch}
      />
    );
  }

  return (
    <ClinicShell title={t("clinicMessages.title")} description={t("clinicMessages.subtitle")}>
      {body}
      {user && activeClinic ? (
        <ClinicInbox
          key={`${user.id}:${activeClinic.id}`}
          conversations={conversations
            .filter((c) => c.clinicId === activeClinic.id)
            .sort((a, b) => lastSentAt(b).localeCompare(lastSentAt(a)))}
          suspended={!!body}
        />
      ) : null}
    </ClinicShell>
  );
}

function ClinicInbox({
  conversations,
  suspended,
}: {
  conversations: Conversation[];
  suspended: boolean;
}) {
  const { sendMessage, doctorById } = useApp();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/clinic/messages" });
  const logRef = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  const focusNext = useRef<"detail" | "list" | undefined>(undefined);
  const [waiting, setWaiting] = useState(false);
  const { t, fmt } = useI18n();
  const sentLabel = (iso: string) =>
    `${fmt.shortDate(isoDate(new Date(iso)))}, ${fmt.clockTime(iso)}`;

  const active = search.c ? conversations.find((c) => c.id === search.c) : undefined;
  const activeId = active?.id;
  const { text, setText, sending, error, send } = useMessageDraft(suspended ? undefined : activeId);
  const activeMessageCount = active?.messages.length ?? 0;

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [activeId, activeMessageCount]);

  useEffect(() => {
    if (activeId && focusNext.current === "detail") {
      heading.current?.focus({ preventScroll: true });
      focusNext.current = undefined;
    } else if (!activeId && focusNext.current === "list") {
      listHeading.current?.focus({ preventScroll: true });
      focusNext.current = undefined;
    }
  }, [activeId]);

  const visible = waiting
    ? conversations.filter((item) => item.messages.at(-1)?.sender === "patient")
    : conversations;

  const subtitleOf = (c: Conversation) => {
    const doctor = c.doctorId ? doctorById(c.doctorId) : undefined;
    if (c.kind === "appointment") {
      const appointment = c.appointmentDate
        ? t("messages.appointmentOn", { date: fmt.shortDate(c.appointmentDate) })
        : t("messages.aboutAppointment");
      return doctor ? [appointment, doctor.name].join(" · ") : appointment;
    }
    return t("messages.general");
  };

  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault();
    if (!active) return;
    await send(
      (body, id) => sendMessage(active.id, body, id),
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
      <div className="surface-card flex flex-col items-center gap-2 px-4 py-7 text-center text-muted-foreground">
        <MessageSquare className="h-10 w-10 opacity-30" aria-hidden />
        <p className="font-medium text-foreground">{t("messages.emptyTitle")}</p>
        <p className="max-w-sm text-sm">{t("clinicMessages.emptyBody")}</p>
      </div>
    );
  }

  return (
    <div className="grid min-h-[min(430px,65dvh)] overflow-hidden rounded-2xl border bg-card shadow-sm md:h-[max(450px,calc(100dvh-13rem))] md:grid-cols-[minmax(230px,32%)_minmax(0,1fr)]">
      <div
        className={cn(
          "min-h-0 min-w-0 flex-col border-e bg-muted/20",
          active ? "hidden md:flex" : "flex",
        )}
      >
        <div className="space-y-2 border-b bg-card px-3 py-3">
          <h2
            ref={listHeading}
            tabIndex={-1}
            className="font-display font-semibold focus-visible:outline-ring"
          >
            {t("messages.conversations")}
          </h2>
          <div
            className="flex flex-wrap gap-1.5"
            role="group"
            aria-label={t("messages.conversations")}
          >
            <Button
              size="sm"
              variant={waiting ? "ghost" : "secondary"}
              aria-pressed={!waiting}
              onClick={() => setWaiting(false)}
            >
              {t("clinicAppointments.filter.all")}
            </Button>
            <Button
              size="sm"
              variant={waiting ? "secondary" : "ghost"}
              aria-pressed={waiting}
              className="h-auto min-h-8 whitespace-normal"
              onClick={() => setWaiting(true)}
            >
              {t("clinicWorkspace.needsReplyFilter")}
            </Button>
          </div>
        </div>
        {search.c && !active ? (
          <p className="px-3 pt-3 text-sm text-muted-foreground md:hidden" role="status">
            {t("messages.unavailable")}
          </p>
        ) : null}
        {visible.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">
            {t("clinicWorkspace.noRepliesNeeded")}
          </p>
        ) : null}
        <ul
          aria-label={t("messages.conversations")}
          className="min-h-0 flex-1 divide-y overflow-y-auto"
        >
          {visible.map((c) => {
            const last = c.messages[c.messages.length - 1];
            const isActive = c.id === activeId;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => {
                    if (activeId === c.id) return;
                    focusNext.current = "detail";
                    void navigate({ search: { c: c.id } });
                  }}
                  aria-current={isActive ? "true" : undefined}
                  className={cn(
                    "flex w-full items-center gap-3 p-3 text-start transition-colors motion-reduce:transition-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    isActive ? "bg-primary-soft/50" : "hover:bg-muted/50",
                  )}
                >
                  <Initials name={c.patientName} className="h-10 w-10 text-xs" />
                  <span className="min-w-0 flex-1">
                    <span className="mb-0.5 flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">
                        {c.patientName || t("common.unknownPatient")}
                      </span>
                      {last ? (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {fmt.shortDate(isoDate(new Date(last.sentAt)))}
                        </span>
                      ) : null}
                    </span>
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span
                        className="min-w-0 text-xs text-muted-foreground [overflow-wrap:anywhere]"
                        dir="auto"
                      >
                        {subtitleOf(c)}
                      </span>
                      {last?.sender === "patient" ? (
                        <span className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary">
                          {t("messages.awaitingReply")}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-1 block truncate text-xs text-muted-foreground" dir="auto">
                      {last
                        ? last.sender === "clinic"
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
        className={cn("flex min-h-0 flex-col bg-background/50", active ? "flex" : "hidden md:flex")}
      >
        {active ? (
          <>
            <div className="flex items-center gap-3 border-b bg-card p-3">
              <Button
                variant="ghost"
                size="icon"
                className="md:hidden"
                onClick={() => {
                  focusNext.current = "list";
                  void navigate({ search: {} });
                }}
                aria-label={t("messages.back")}
              >
                <ArrowLeft className="h-5 w-5 rtl:rotate-180" aria-hidden />
              </Button>
              <Initials name={active.patientName} className="h-9 w-9 text-xs" />
              <div className="min-w-0">
                <h2
                  ref={heading}
                  tabIndex={-1}
                  dir="auto"
                  className="font-semibold [overflow-wrap:anywhere] focus-visible:outline-ring"
                >
                  {active.patientName || t("common.unknownPatient")}
                </h2>
                <p dir="auto" className="text-xs text-muted-foreground [overflow-wrap:anywhere]">
                  {subtitleOf(active)}
                </p>
              </div>
            </div>

            <div
              ref={logRef}
              role="log"
              aria-live="polite"
              aria-label={t("clinicMessages.title")}
              className="max-h-[55dvh] min-h-28 flex-1 space-y-4 overflow-y-auto p-3 sm:p-4 md:max-h-none"
            >
              {active.messages.length ? (
                active.messages.map((m) => {
                  const isMe = m.sender === "clinic";
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
                          "whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-start text-sm",
                          isMe
                            ? "rounded-se-sm bg-primary text-primary-foreground"
                            : "rounded-ss-sm bg-muted text-foreground",
                        )}
                      >
                        <span className="sr-only">
                          {isMe ? t("messages.senderClinic") : t("messages.senderPatient")}{" "}
                        </span>
                        <span dir="auto">{m.body}</span>
                      </div>
                      <time
                        dateTime={m.sentAt}
                        className="mx-1 mt-1 text-[10px] text-muted-foreground"
                      >
                        {sentLabel(m.sentAt)}
                      </time>
                    </div>
                  );
                })
              ) : (
                <p className="pt-8 text-center text-sm text-muted-foreground">
                  {t("clinicMessages.noMessages")}
                </p>
              )}
            </div>

            <form onSubmit={handleSend} className="border-t bg-card p-3">
              <p className="mb-2 text-xs text-muted-foreground">
                {t("messages.notForEmergencies")}
              </p>
              {sending ? (
                <p role="status" className="mb-2 text-sm text-muted-foreground">
                  {t("clinicWorkspace.sending")}
                </p>
              ) : null}
              {error ? (
                <p role="alert" className="mb-2 text-sm text-destructive">
                  {error}
                </p>
              ) : null}
              <div className="flex items-end gap-2 rounded-xl border bg-muted/50 p-1 transition-all focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20">
                <label htmlFor="clinic-message-input" className="sr-only">
                  {t("clinicMessages.replyLabel")}
                </label>
                <textarea
                  id="clinic-message-input"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder={t("clinicMessages.replyPlaceholder")}
                  maxLength={MAX_MESSAGE_LENGTH}
                  className="max-h-32 min-h-10 min-w-0 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
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
                  aria-label={t("clinicMessages.send")}
                >
                  {sending ? (
                    <Loader2
                      className="h-4 w-4 animate-spin motion-reduce:animate-none"
                      aria-hidden
                    />
                  ) : (
                    <Send className="h-4 w-4 rtl:-scale-x-100" aria-hidden />
                  )}
                </Button>
              </div>
            </form>
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

import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MessageSquare, Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { ErrorState, Initials, PageLoader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { isoDate } from "@/lib/format";
import { useI18n } from "@/lib/i18n";
import { describeDataError } from "@/lib/supabase/errors";
import { cn } from "@/lib/utils";
import type { Conversation } from "@/lib/types";

export const Route = createFileRoute("/clinic/messages")({
  // Returned explicitly so an invalid raw ?c= can't survive TanStack's merge with the URL.
  validateSearch: ({ c }: Record<string, unknown>): { c?: string | undefined } => ({
    c: typeof c === "string" && c ? c : undefined,
  }),
  component: ClinicMessages,
});

const MAX_MESSAGE_LENGTH = 2000;
const lastSentAt = (c: Conversation) => c.messages[c.messages.length - 1]?.sentAt ?? "";

function ClinicMessages() {
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
  } else {
    const mine = conversations
      .filter((c) => c.clinicId === activeClinic.id)
      .sort((a, b) => lastSentAt(b).localeCompare(lastSentAt(a)));
    body = <ClinicInbox conversations={mine} />;
  }

  return (
    <ClinicShell title={t("clinicMessages.title")} description={t("clinicMessages.subtitle")}>
      {body}
    </ClinicShell>
  );
}

function ClinicInbox({ conversations }: { conversations: Conversation[] }) {
  const { sendMessage, doctorById } = useApp();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/clinic/messages" });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { t, fmt } = useI18n();
  const sentLabel = (iso: string) =>
    `${fmt.shortDate(isoDate(new Date(iso)))}, ${fmt.clockTime(iso)}`;

  const active = search.c ? conversations.find((c) => c.id === search.c) : undefined;
  const activeId = active?.id;
  const activeMessageCount = active?.messages.length ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [activeId, activeMessageCount]);

  const subtitleOf = (c: Conversation) => {
    const doctor = c.doctorId ? doctorById(c.doctorId) : undefined;
    if (c.kind === "appointment") {
      return doctor
        ? t("messages.aboutAppointmentWith", { doctor: doctor.name })
        : t("messages.aboutAppointment");
    }
    return t("messages.general");
  };

  const handleSend = async (e?: FormEvent) => {
    e?.preventDefault();
    const body = text.trim();
    if (!body || !active || sending) return;
    setSending(true);
    try {
      await sendMessage(active.id, body);
      setText("");
    } catch (err) {
      toast.error(t("messages.notSent", { reason: t(describeDataError(err)) }));
    } finally {
      setSending(false);
    }
  };

  if (!conversations.length) {
    return (
      <div className="surface-card flex flex-col items-center gap-3 px-6 py-12 text-center text-muted-foreground">
        <MessageSquare className="h-10 w-10 opacity-30" aria-hidden />
        <p className="font-medium text-foreground">{t("messages.emptyTitle")}</p>
        <p className="max-w-sm text-sm">{t("clinicMessages.emptyBody")}</p>
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100dvh-12rem)] min-h-[420px] overflow-hidden rounded-xl border bg-card shadow-sm md:grid-cols-[300px_minmax(0,1fr)] lg:grid-cols-[340px_minmax(0,1fr)]">
      <ul
        aria-label={t("messages.conversations")}
        className={cn(
          "min-h-0 divide-y overflow-y-auto border-e bg-muted/20",
          active ? "hidden md:block" : "block",
        )}
      >
        {conversations.map((c) => {
          const last = c.messages[c.messages.length - 1];
          const isActive = c.id === activeId;
          return (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => navigate({ search: { c: c.id } })}
                aria-current={isActive ? "true" : undefined}
                className={cn(
                  "flex w-full items-center gap-3 p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
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
                  <span className="block truncate text-xs text-muted-foreground">
                    {subtitleOf(c)}
                  </span>
                  <span className="mt-1 block truncate text-xs text-muted-foreground">
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
                onClick={() => navigate({ search: {} })}
                aria-label={t("messages.back")}
              >
                <ArrowLeft className="h-5 w-5 rtl:rotate-180" aria-hidden />
              </Button>
              <Initials name={active.patientName} className="h-9 w-9 text-xs" />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">
                  {active.patientName || t("common.unknownPatient")}
                </h2>
                <p className="truncate text-xs text-muted-foreground">{subtitleOf(active)}</p>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
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
                          "whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-sm",
                          isMe
                            ? "rounded-se-sm bg-primary text-primary-foreground"
                            : "rounded-ss-sm bg-muted text-foreground",
                        )}
                      >
                        <span className="sr-only">
                          {isMe ? t("messages.senderClinic") : t("messages.senderPatient")}{" "}
                        </span>
                        {m.body}
                      </div>
                      <span className="mx-1 mt-1 text-[10px] text-muted-foreground">
                        {sentLabel(m.sentAt)}
                      </span>
                    </div>
                  );
                })
              ) : (
                <p className="pt-8 text-center text-sm text-muted-foreground">
                  {t("clinicMessages.noMessages")}
                </p>
              )}
              <div ref={endRef} />
            </div>

            <form onSubmit={handleSend} className="border-t bg-card p-3">
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
                  className="max-h-32 min-h-10 flex-1 resize-none bg-transparent px-3 py-2 text-sm outline-none"
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
                  aria-label={t("clinicMessages.send")}
                >
                  {sending ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
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

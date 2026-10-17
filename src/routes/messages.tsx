import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MessageSquare, Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { PatientShell } from "@/components/layout/PatientShell";
import { EmptyState, ErrorState, Initials, PageLoader } from "@/components/common";
import { MissingProfile } from "@/components/MissingProfile";
import { CatalogNotice } from "@/components/CatalogNotice";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";
import { describeDataError } from "@/lib/supabase/errors";
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
  head: () => ({ meta: [{ title: "Messages — CareConnect" }] }),
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
  } = useApp();
  const { loading, user } = useProtectedRoute();
  const { t } = useI18n();
  const { c: requestedId } = Route.useSearch();
  // A conversation that was just started can be newer than the cached list: wait for the
  // refetch rather than briefly claiming the inbox is empty or the conversation unavailable.
  const awaitingRequested =
    !!requestedId && status.isFetching && !conversations.some((c) => c.id === requestedId);

  let body;
  if (loading || !user || isLoadingPatient || status.isLoading || awaitingRequested) {
    body = <PageLoader label={t("messages.loading")} />;
  } else if (patientError || status.error) {
    body = (
      <ErrorState
        title={t("messages.loadError")}
        message={t(describeDataError(patientError ?? status.error))}
        onRetry={status.refetch}
      />
    );
  } else if (!patient) {
    body = <MissingProfile action="messages" />;
  } else {
    const mine = conversations
      .filter((c) => c.patientId === patient.id)
      .sort((a, b) => lastSentAt(b).localeCompare(lastSentAt(a)));
    body = <Inbox conversations={mine} />;
  }

  return (
    <PatientShell>
      <div className="space-y-4">
        <CatalogNotice />
        {body}
      </div>
    </PatientShell>
  );
}

function Inbox({ conversations }: { conversations: Conversation[] }) {
  const { sendMessage, clinicById, doctorById } = useApp();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/messages" });
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const { t, fmt } = useI18n();

  const active = search.c ? conversations.find((c) => c.id === search.c) : undefined;
  const activeId = active?.id;
  const activeMessageCount = active?.messages.length ?? 0;

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [activeId, activeMessageCount]);

  const titleOf = (c: Conversation) => {
    const clinic = clinicById(c.clinicId);
    const doctor = c.doctorId ? doctorById(c.doctorId) : undefined;
    const clinicName = clinic?.name ?? t("common.clinic");
    return doctor ? `${clinicName} · ${doctor.name}` : clinicName;
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
      <div className="space-y-6">
        <h1 className="font-display text-2xl font-bold">{t("messages.title")}</h1>
        <EmptyState
          icon={MessageSquare}
          title={t("messages.emptyTitle")}
          description={t("messages.emptyBody")}
          action={
            <Button asChild size="sm">
              <Link to="/discover">{t("common.findDoctors")}</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100dvh-13rem)] min-h-[420px] overflow-hidden rounded-xl border bg-card shadow-sm md:grid-cols-[300px_minmax(0,1fr)] lg:h-[calc(100dvh-10rem)] lg:grid-cols-[340px_minmax(0,1fr)]">
      <div
        className={cn(
          "flex min-h-0 flex-col border-e bg-muted/20",
          active ? "hidden md:flex" : "flex",
        )}
      >
        <div className="border-b bg-card p-4">
          <h1 className="font-display text-lg font-semibold">{t("messages.title")}</h1>
        </div>
        <ul className="flex-1 divide-y overflow-y-auto" aria-label={t("messages.conversations")}>
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
                    "flex w-full items-center gap-3 p-4 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
                    isActive ? "bg-primary-soft/50" : "hover:bg-muted/50",
                  )}
                >
                  <span className="relative shrink-0">
                    <Initials name={title} className="h-10 w-10 text-xs" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="mb-0.5 flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{title}</span>
                      {last ? (
                        <span className="shrink-0 text-[10px] text-muted-foreground">
                          {fmt.shortDate(isoDate(new Date(last.sentAt)))}
                        </span>
                      ) : null}
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
              <Initials name={titleOf(active)} className="h-9 w-9 text-xs" />
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{titleOf(active)}</h2>
                <p className="truncate text-xs text-muted-foreground">
                  {active.kind === "appointment"
                    ? t("messages.aboutAppointment")
                    : t("messages.general")}
                </p>
              </div>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
              <p className="text-center">
                <span className="rounded-full bg-muted px-2 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                  {t("messages.notForEmergencies")}
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
                          "whitespace-pre-wrap break-words rounded-2xl px-4 py-2 text-start text-sm",
                          isMe
                            ? "rounded-se-sm bg-primary text-primary-foreground"
                            : "rounded-ss-sm bg-muted text-foreground",
                        )}
                      >
                        <span className="sr-only">
                          {isMe ? t("messages.senderYou") : t("messages.senderClinic")}{" "}
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
                <p className="pt-8 text-center text-sm text-muted-foreground">
                  {t("messages.writeBelow")}
                </p>
              )}
              <div ref={endRef} />
            </div>

            <form onSubmit={handleSend} className="border-t bg-card p-3">
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

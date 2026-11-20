import { RefreshCw, LockKeyhole } from "lucide-react";
import { pageTitles } from "@/lib/page-titles";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Loader2, MessageSquare, Send } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMessageDraft } from "@/hooks/useMessageDraft";
import { DoctorShell } from "@/components/layout/DoctorShell";
import { EmptyState, ErrorState, InfoNotice, PageLoader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/supabase/auth";
import {
  useDoctorConversations,
  useDoctorReply,
  type DoctorConversation,
} from "@/lib/supabase/doctor";
import { describeDataError, isNetworkError, isNotDeployed } from "@/lib/supabase/errors";
import {
  usePrivateDoctorInbox,
  useSendPrivateDoctorMessage,
} from "@/lib/supabase/private-doctor-messaging";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/doctor/messages")({
  validateSearch: ({ c }: Record<string, unknown>): { c?: string | undefined } => ({
    c: typeof c === "string" && c ? c : undefined,
  }),
  head: () => ({ meta: [{ title: pageTitles.messages }] }),
  component: DoctorMessagesPage,
});

const MAX_MESSAGE_LENGTH = 2000;

function DoctorMessagesPage() {
  const { t } = useI18n();
  return (
    <DoctorShell title={t("doctorMessages.title")} description={t("doctorMessages.subtitle")}>
      {() => <Inbox />}
    </DoctorShell>
  );
}

function Inbox() {
  const { user } = useAuth();
  const { t } = useI18n();
  // doctor_conversations() returns only conversations about this doctor at verified clinics.
  const conversations = useDoctorConversations(true);
  const privateInbox = usePrivateDoctorInbox(true);
  const search = Route.useSearch();
  const privateThreads: DoctorConversation[] = privateInbox.error
    ? []
    : (privateInbox.data ?? []).map((c) => ({
        id: c.id,
        clinicId: c.clinicId,
        clinicName: c.clinicName,
        patientName: c.patientName,
        privateAppointment: { id: c.appointmentId, date: c.appointmentDate, canSend: c.canSend },
        messages: c.messages.map((m) => ({
          id: m.id,
          body: m.body,
          sentAt: m.sentAt,
          from: m.sender === "doctor" ? "you" : "patient",
        })),
      }));

  const list = [...(conversations.error ? [] : (conversations.data ?? [])), ...privateThreads].sort(
    (a, b) => (b.messages.at(-1)?.sentAt ?? "").localeCompare(a.messages.at(-1)?.sentAt ?? ""),
  );
  const loading =
    (list.length === 0 && (conversations.isLoading || privateInbox.isLoading)) ||
    (!!search.c?.startsWith("doctor:") &&
      privateInbox.isFetching &&
      !list.some((c) => c.id === search.c));
  let status;
  if (loading) {
    status = <PageLoader label={t("common.loading")} />;
  } else if (conversations.error) {
    status = isNotDeployed(conversations.error) ? (
      <InfoNotice>{t("doctorPortal.notDeployed")}</InfoNotice>
    ) : (
      <ErrorState
        title={t("doctorMessages.loadError")}
        message={t(describeDataError(conversations.error))}
        onRetry={() => void conversations.refetch()}
      />
    );
  } else if (list.length === 0 && !privateInbox.error) {
    status = (
      <EmptyState
        icon={MessageSquare}
        title={t("doctorMessages.none")}
        description={t("doctorMessages.noneBody")}
      />
    );
  }
  return (
    <>
      {status}
      {privateInbox.error ? (
        isNotDeployed(privateInbox.error) ? (
          <InfoNotice>{t("doctorWorkspace.privateUnavailable")}</InfoNotice>
        ) : (
          <ErrorState
            title={t("messages.doctorLoadError")}
            message={t(describeDataError(privateInbox.error))}
            onRetry={() => void privateInbox.refetch()}
          />
        )
      ) : null}
      {user ? (
        <InboxContent
          key={user.id}
          list={list}
          suspended={loading || list.length === 0}
          refreshing={conversations.isFetching || privateInbox.isFetching}
          refresh={() => {
            void conversations.refetch();
            void privateInbox.refetch();
          }}
        />
      ) : null}
    </>
  );
}

function InboxContent({
  list,
  suspended,
  refreshing,
  refresh,
}: {
  list: DoctorConversation[];
  suspended: boolean;
  refreshing: boolean;
  refresh: () => void;
}) {
  const { user } = useAuth();
  const { t, fmt } = useI18n();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/doctor/messages" });
  const reply = useDoctorReply();
  const [filter, setFilter] = useState("");
  const visible = list.filter(
    (thread) => !filter || Boolean(thread.privateAppointment) === (filter === "private"),
  );
  const threadHeading = useRef<HTMLHeadingElement>(null);
  const focusThread = useRef(false);
  const privateReply = useSendPrivateDoctorMessage();
  // An id from the URL only selects among this doctor's own conversations.
  const active = search.c ? list.find((c) => c.id === search.c) : undefined;
  useEffect(() => {
    if (active?.id && focusThread.current) {
      threadHeading.current?.focus();
      focusThread.current = false;
    }
  }, [active?.id]);
  const { text, setText, sending, error, send } = useMessageDraft(
    suspended ? undefined : active?.id,
  );
  const handleSend = async (e: FormEvent) => {
    e.preventDefault();
    if (!active || !user || active.privateAppointment?.canSend === false) return;
    await send(
      (body, messageId) =>
        active.privateAppointment
          ? privateReply.mutateAsync({
              appointmentId: active.privateAppointment.id,
              body,
              messageId,
            })
          : reply.mutateAsync({ conversationId: active.id, senderId: user.id, body, messageId }),
      (err) =>
        isNetworkError(err)
          ? t("messages.deliveryUnconfirmed")
          : t("doctorMessages.sendFailed", { reason: t(describeDataError(err)) }),
    );
  };
  if (suspended) return null;
  return (
    <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)]">
      <div className={cn("min-w-0 rounded-2xl border bg-card p-3", active && "hidden md:block")}>
        <div className="mb-3 flex items-end gap-2">
          <div className="min-w-0 flex-1">
            <Label htmlFor="doctor-thread-filter" className="mb-1.5 block">
              {t("doctorMessages.title")}
            </Label>
            <NativeSelect
              id="doctor-thread-filter"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="">{t("doctorWorkspace.allThreads")}</option>
              <option value="clinic">{t("messages.clinicThread")}</option>
              <option value="private">{t("messages.privateDoctor")}</option>
            </NativeSelect>
          </div>
          <Button
            type="button"
            variant="outline"
            size="icon"
            className="shrink-0"
            disabled={refreshing}
            onClick={refresh}
            aria-label={t("doctorWorkspace.refreshInbox")}
          >
            <RefreshCw aria-hidden />
          </Button>
        </div>
        {!visible.length ? (
          <p className="p-2 text-sm text-muted-foreground">{t("doctorMessages.none")}</p>
        ) : null}
        <ul className="min-w-0 space-y-2" aria-label={t("doctorMessages.title")}>
          {visible.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  focusThread.current = active?.id !== c.id;
                  void navigate({ to: "/doctor/messages", search: { c: c.id } });
                }}
                aria-current={active?.id === c.id ? "true" : undefined}
                className={cn(
                  "w-full rounded-xl border bg-card p-3 text-start transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  active?.id === c.id && "border-primary/50 bg-primary-soft/50",
                )}
              >
                <span className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <span className="min-w-0 truncate font-medium" dir="auto">
                    {c.patientName}
                  </span>
                  {c.messages[c.messages.length - 1]?.from === "patient" ? (
                    <span className="rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary">
                      {t("messages.awaitingReply")}
                    </span>
                  ) : null}
                </span>
                <span className="block truncate text-xs text-muted-foreground" dir="auto">
                  {c.privateAppointment
                    ? `${t("messages.privateDoctor")} · ${t("messages.appointmentOn", { date: fmt.shortDate(c.privateAppointment.date) })}`
                    : t("messages.clinicThread") + " · " + c.clinicName}
                </span>
                {c.messages.length ? (
                  <span className="mt-1 block truncate text-sm text-muted-foreground" dir="auto">
                    {c.messages[c.messages.length - 1]?.body}
                  </span>
                ) : (
                  <span className="block text-xs text-muted-foreground">
                    {t("messages.noMessages")}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      </div>
      {active ? (
        <Thread
          headingRef={threadHeading}
          conversation={active}
          body={text}
          setBody={setText}
          sending={sending}
          error={error}
          send={handleSend}
          back={() => void navigate({ search: {} })}
        />
      ) : (
        <div className="surface-card grid place-items-center p-10 text-sm text-muted-foreground">
          {search.c ? t("messages.unavailable") : t("messages.select")}
        </div>
      )}
    </div>
  );
}

function Thread({
  headingRef,
  conversation,
  body,
  setBody,
  sending,
  error,
  send,
  back,
}: {
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  conversation: DoctorConversation;
  body: string;
  setBody: (value: string) => void;
  sending: boolean;
  error: string | undefined;
  send: (e: FormEvent) => void;
  back: () => void;
}) {
  const { t, fmt } = useI18n();
  const label = {
    you: t("common.you"),
    patient: conversation.patientName,
    clinic: conversation.clinicName,
  };
  return (
    <section
      className="flex min-h-[420px] min-w-0 flex-col rounded-2xl border bg-card p-4"
      aria-label={conversation.patientName}
    >
      <header className="border-b pb-3">
        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={back}
          aria-label={t("messages.back")}
        >
          <ArrowLeft className="rtl:rotate-180" aria-hidden />
        </Button>
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="font-display text-lg font-semibold [overflow-wrap:anywhere]"
          dir="auto"
        >
          {conversation.patientName}
        </h2>
        <p className="text-xs text-muted-foreground" dir="auto">
          {conversation.privateAppointment
            ? `${t("messages.privateDoctor")} · ${t("messages.appointmentOn", { date: fmt.shortDate(conversation.privateAppointment.date) })}`
            : t("messages.clinicThread") + " · " + conversation.clinicName}
        </p>
        {conversation.privateAppointment ? (
          <p className="mt-2 flex items-start gap-2 rounded-lg bg-muted p-2 text-xs text-muted-foreground">
            <LockKeyhole className="size-4 shrink-0" aria-hidden />
            {t("messages.doctorNonEmergency")}
          </p>
        ) : null}
      </header>
      <ol className="max-h-[55dvh] flex-1 space-y-3 overflow-y-auto py-4">
        {conversation.messages.map((m) => (
          <li key={m.id} className={cn("flex", m.from === "you" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[85%] rounded-2xl px-3.5 py-2 text-sm",
                m.from === "you"
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-foreground",
              )}
            >
              <p className="text-[11px] font-semibold opacity-80" dir="auto">
                {label[m.from]}
              </p>
              <p className="whitespace-pre-wrap [overflow-wrap:anywhere]" dir="auto">
                {m.body}
              </p>
              <p className="mt-0.5 text-[10px] opacity-70">{fmt.clockTime(m.sentAt)}</p>
            </div>
          </li>
        ))}
      </ol>
      {!conversation.messages.length ? (
        <p className="mb-3 text-sm text-muted-foreground">{t("messages.noMessages")}</p>
      ) : null}
      {error ? (
        <p role="alert" className="pt-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {conversation.privateAppointment?.canSend === false ? (
        <p className="border-t pt-3 text-sm text-muted-foreground">{t("messages.doctorClosed")}</p>
      ) : (
        <form onSubmit={send} className="flex items-end gap-2 border-t pt-3">
          <label htmlFor="doctor-reply" className="sr-only">
            {t("doctorMessages.reply")}
          </label>
          <Textarea
            id="doctor-reply"
            rows={2}
            maxLength={MAX_MESSAGE_LENGTH}
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={t("doctorMessages.reply")}
            className="min-h-[60px] min-w-0 flex-1"
          />
          <Button
            type="submit"
            disabled={sending || !body.trim()}
            aria-label={t("doctorMessages.send")}
          >
            {sending ? (
              <Loader2 className="motion-safe:animate-spin" aria-hidden />
            ) : (
              <Send className="rtl:rotate-180" aria-hidden />
            )}
          </Button>
        </form>
      )}
    </section>
  );
}

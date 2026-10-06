import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, MessageSquare, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { DoctorShell } from "@/components/layout/DoctorShell";
import { EmptyState, ErrorState, InfoNotice, PageLoader } from "@/components/common";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/lib/i18n";
import { useAuth } from "@/lib/supabase/auth";
import {
  useDoctorConversations,
  useDoctorReply,
  type DoctorConversation,
} from "@/lib/supabase/doctor";
import { describeDataError, isNotDeployed } from "@/lib/supabase/errors";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/doctor/messages")({
  validateSearch: ({ c }: Record<string, unknown>): { c?: string | undefined } => ({
    c: typeof c === "string" && c ? c : undefined,
  }),
  head: () => ({ meta: [{ title: "Messages — CareConnect Doctor Portal" }] }),
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
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = useNavigate();
  // doctor_conversations() returns only conversations about this doctor at verified clinics.
  const conversations = useDoctorConversations(true);

  if (conversations.isLoading) return <PageLoader label={t("common.loading")} />;
  if (conversations.error) {
    return isNotDeployed(conversations.error) ? (
      <InfoNotice>{t("doctorPortal.notDeployed")}</InfoNotice>
    ) : (
      <ErrorState
        title={t("doctorMessages.loadError")}
        message={t(describeDataError(conversations.error))}
        onRetry={() => void conversations.refetch()}
      />
    );
  }
  const list = conversations.data ?? [];
  if (list.length === 0) {
    return (
      <EmptyState
        icon={MessageSquare}
        title={t("doctorMessages.none")}
        description={t("doctorMessages.noneBody")}
      />
    );
  }
  // An id from the URL only selects among this doctor's own conversations.
  const active = search.c ? list.find((c) => c.id === search.c) : undefined;

  return (
    <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
      <ul className="space-y-2" aria-label={t("doctorMessages.title")}>
        {list.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => navigate({ to: "/doctor/messages", search: { c: c.id } })}
              aria-current={active?.id === c.id ? "true" : undefined}
              className={cn(
                "w-full rounded-xl border bg-card p-3 text-start transition-colors hover:border-primary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active?.id === c.id && "border-primary/50 bg-primary-soft/50",
              )}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="truncate font-medium" dir="auto">
                  {c.patientName}
                </span>
                {c.messages[c.messages.length - 1]?.from === "patient" ? (
                  <span className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[11px] font-medium text-primary">
                    {t("messages.awaitingReply")}
                  </span>
                ) : null}
              </span>
              <span className="block truncate text-xs text-muted-foreground" dir="auto">
                {c.clinicName}
              </span>
              {c.messages.length ? (
                <span className="mt-1 block truncate text-sm text-muted-foreground" dir="auto">
                  {c.messages[c.messages.length - 1]?.body}
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {active ? (
        <Thread conversation={active} />
      ) : (
        <div className="surface-card grid place-items-center p-10 text-sm text-muted-foreground">
          {search.c ? t("messages.unavailable") : t("messages.select")}
        </div>
      )}
    </div>
  );
}

function Thread({ conversation }: { conversation: DoctorConversation }) {
  const { t, fmt } = useI18n();
  const { user } = useAuth();
  const reply = useDoctorReply();
  const [body, setBody] = useState("");

  const send = async (e: FormEvent) => {
    e.preventDefault();
    const text = body.trim();
    if (!text || !user) return;
    try {
      await reply.mutateAsync({ conversationId: conversation.id, senderId: user.id, body: text });
      setBody("");
    } catch (err) {
      toast.error(t("doctorMessages.sendFailed", { reason: t(describeDataError(err)) }));
    }
  };

  const label = {
    you: t("common.you"),
    patient: conversation.patientName,
    clinic: conversation.clinicName,
  };
  return (
    <section
      className="surface-card flex min-h-[420px] flex-col p-4"
      aria-label={conversation.patientName}
    >
      <header className="border-b pb-3">
        <h2 className="font-semibold" dir="auto">
          {conversation.patientName}
        </h2>
        <p className="text-xs text-muted-foreground" dir="auto">
          {conversation.clinicName}
        </p>
      </header>
      <ol className="flex-1 space-y-3 overflow-y-auto py-4">
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
          className="min-h-[60px] flex-1"
        />
        <Button
          type="submit"
          disabled={reply.isPending || !body.trim()}
          aria-label={t("doctorMessages.send")}
        >
          {reply.isPending ? (
            <Loader2 className="animate-spin" aria-hidden />
          ) : (
            <Send className="rtl:rotate-180" aria-hidden />
          )}
        </Button>
      </form>
    </section>
  );
}

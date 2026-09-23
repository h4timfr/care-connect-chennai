import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ClinicShell } from "@/components/layout/ClinicShell";
import { MessageSquare, ArrowLeft, Send } from "lucide-react";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { Initials } from "@/components/common";
import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { to12h } from "@/lib/format";

import { useProtectedRoute } from "@/hooks/useProtectedRoute";

export const Route = createFileRoute("/clinic/messages")({
  component: ClinicMessages,
  validateSearch: (search: Record<string, unknown>) => {
    const params: { c?: string } = {};
    if (typeof search["c"] === "string" && search["c"]) {
      params.c = search["c"];
    }
    return params;
  },
});

function ClinicMessages() {
  const { conversations, activeClinic, markRead, sendMessage, doctorById } = useApp();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { loading, user } = useProtectedRoute("/clinic/messages");

  const clinicConversations = conversations
    .filter((c) => c.clinicId === activeClinic?.id)
    .sort((a, b) => {
      const lastA = a.messages[a.messages.length - 1]?.sentAt ?? "";
      const lastB = b.messages[b.messages.length - 1]?.sentAt ?? "";
      return lastB.localeCompare(lastA);
    });

  const activeConversation = search.c
    ? clinicConversations.find((c) => c.id === search.c)
    : undefined;

  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeConversation && activeConversation.unreadForClinic > 0) {
      markRead(activeConversation.id, "clinic");
    }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation, markRead]);

  if (loading) return <ClinicShell title="Loading..." children={<div className="p-8">Loading...</div>} />;
  
  if (!user || !activeClinic) return null;

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !activeConversation) return;
    sendMessage(activeConversation.id, "clinic", text.trim());
    setText("");
  };

  return (
    <ClinicShell title="Messages" description="Communicate with patients">
      <div
        className={cn(
          "grid h-[calc(100vh-180px)] min-h-[400px] overflow-hidden rounded-xl border bg-card shadow-sm md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[380px_minmax(0,1fr)]",
        )}
      >
        {/* Sidebar */}
        <div
          className={cn(
            "flex flex-col border-r bg-muted/20",
            activeConversation ? "hidden md:flex" : "flex",
          )}
        >
          <div className="flex-1 overflow-y-auto">
            {clinicConversations.length > 0 ? (
              <div className="divide-y">
                {clinicConversations.map((c) => {
                  const last = c.messages[c.messages.length - 1];
                  const isActive = search.c === c.id;
                  const doc = c.doctorId ? doctorById(c.doctorId) : undefined;

                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "p-4 flex items-center gap-3 cursor-pointer transition-colors",
                        isActive ? "bg-primary-soft/50" : "hover:bg-muted/50",
                      )}
                      onClick={() => navigate({ to: "/clinic/messages", search: { c: c.id } })}
                    >
                      <div className="relative shrink-0">
                        <Initials name={c.patientName} className="h-10 w-10 text-xs" />
                        {c.unreadForClinic > 0 && !isActive && (
                          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <h3
                            className={cn(
                              "font-medium truncate text-sm",
                              c.unreadForClinic > 0 && !isActive && "font-bold text-foreground",
                            )}
                          >
                            {c.patientName}
                          </h3>
                          {last && (
                            <span className="text-[10px] text-muted-foreground shrink-0 ml-2">
                              {new Date(last.sentAt).toLocaleDateString(undefined, {
                                month: "short",
                                day: "numeric",
                              })}
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground truncate">
                          {c.kind === "appointment"
                            ? `Appt Enquiry ${doc ? "with " + doc.name : ""}`
                            : "General Inquiry"}
                        </p>
                        <p
                          className={cn(
                            "text-xs truncate mt-1",
                            c.unreadForClinic > 0 && !isActive
                              ? "font-medium text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {last
                            ? last.sender === "clinic"
                              ? `You: ${last.body}`
                              : last.body
                            : "No messages"}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="p-6 text-center text-sm text-muted-foreground">
                No conversations yet.
              </div>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div
          className={cn(
            "flex flex-col bg-background/50",
            !activeConversation ? "hidden md:flex" : "flex",
          )}
        >
          {activeConversation ? (
            <>
              <div className="flex items-center gap-3 p-3 border-b bg-card">
                <button
                  onClick={() => navigate({ to: "/clinic/messages" })}
                  className="md:hidden p-2 -ml-2 text-muted-foreground"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <Initials name={activeConversation.patientName} className="h-9 w-9 text-xs" />
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm truncate">
                    {activeConversation.patientName}
                  </h2>
                  <p className="text-xs text-muted-foreground truncate">
                    {activeConversation.kind === "appointment"
                      ? "Appointment Query"
                      : "General Inquiry"}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {activeConversation.messages.map((m) => {
                  const isMe = m.sender === "clinic";
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex flex-col max-w-[80%]",
                        isMe ? "ml-auto items-end" : "mr-auto items-start",
                      )}
                    >
                      <div
                        className={cn(
                          "px-4 py-2 rounded-2xl text-sm",
                          isMe
                            ? "bg-primary text-primary-foreground rounded-tr-sm"
                            : "bg-muted text-foreground rounded-tl-sm",
                        )}
                      >
                        {m.body}
                      </div>
                      <span className="text-[10px] text-muted-foreground mt-1 mx-1">
                        {to12h(m.sentAt.split("T")[1]?.substring(0, 5) ?? "00:00")}
                      </span>
                    </div>
                  );
                })}
                <div ref={endRef} />
              </div>

              <form onSubmit={handleSend} className="p-3 border-t bg-card">
                <div className="flex items-end gap-2 bg-muted/50 rounded-xl p-1 border focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all">
                  <textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Reply to patient..."
                    className="flex-1 max-h-32 min-h-[40px] resize-none bg-transparent px-3 py-2.5 text-sm outline-none"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSend(e);
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    size="icon"
                    className="h-9 w-9 rounded-lg shrink-0 mb-0.5 mr-0.5"
                    disabled={!text.trim()}
                  >
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </form>
            </>
          ) : (
            <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
              <MessageSquare className="h-12 w-12 mb-4 opacity-20" />
              <p>Select a conversation</p>
            </div>
          )}
        </div>
      </div>
    </ClinicShell>
  );
}

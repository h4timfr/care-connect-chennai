import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { MessageSquare, ArrowLeft, Send, User } from "lucide-react";
import { PatientShell } from "@/components/layout/PatientShell";
import { EmptyState, Initials } from "@/components/common";
import { useApp } from "@/lib/store";
import { cn } from "@/lib/utils";
import { useState, useRef, useEffect } from "react";
import { to12h } from "@/lib/format";
import { Button } from "@/components/ui/button";

import { useProtectedRoute } from "@/hooks/useProtectedRoute";

export const Route = createFileRoute("/messages")({
  component: MessagesView,
  validateSearch: (search: Record<string, unknown>) => {
    const params: { c?: string } = {};
    if (typeof search["c"] === "string" && search["c"]) {
      params.c = search["c"];
    }
    return params;
  },
});

function MessagesView() {
  const { conversations, patient, markRead, sendMessage, clinicById, doctorById } = useApp();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const { loading, user } = useProtectedRoute("/messages");
  const [text, setText] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  const myConversations = conversations
    .filter((c) => c.patientId === patient?.id)
    .sort((a, b) => {
      const lastA = a.messages[a.messages.length - 1]?.sentAt ?? "";
      const lastB = b.messages[b.messages.length - 1]?.sentAt ?? "";
      return lastB.localeCompare(lastA);
    });

  const activeConversation = search.c ? myConversations.find((c) => c.id === search.c) : undefined;

  useEffect(() => {
    if (activeConversation && activeConversation.unreadForPatient > 0) {
      markRead(activeConversation.id, "patient");
    }
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeConversation, markRead]);

  if (loading) {
    return (
      <PatientShell>
        <div className="flex h-[80vh] flex-col items-center justify-center space-y-4">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </PatientShell>
    );
  }

  if (!user || !patient) {
    return null; // redirecting
  }

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || !activeConversation) return;
    sendMessage(activeConversation.id, "patient", text.trim());
    setText("");
  };

  const clinic = activeConversation ? clinicById(activeConversation.clinicId) : undefined;
  const doctor = activeConversation?.doctorId ? doctorById(activeConversation.doctorId) : undefined;
  const activeTitle = doctor ? `${doctor.name} (${clinic?.name})` : clinic?.name;

  return (
    <PatientShell>
      <div
        className={cn(
          "grid h-[calc(100vh-140px)] min-h-[400px] overflow-hidden rounded-xl border bg-card shadow-sm md:grid-cols-[320px_minmax(0,1fr)] lg:grid-cols-[380px_minmax(0,1fr)]",
        )}
      >
        {/* Sidebar */}
        <div
          className={cn(
            "flex flex-col border-r bg-muted/20",
            activeConversation ? "hidden md:flex" : "flex",
          )}
        >
          <div className="p-4 border-b bg-card">
            <h1 className="font-display font-semibold text-lg">Messages</h1>
          </div>
          <div className="flex-1 overflow-y-auto">
            {myConversations.length > 0 ? (
              <div className="divide-y">
                {myConversations.map((c) => {
                  const cClinic = clinicById(c.clinicId);
                  const cDoctor = c.doctorId ? doctorById(c.doctorId) : undefined;
                  const last = c.messages[c.messages.length - 1];
                  const title = cDoctor ? `${cDoctor.name} (${cClinic?.name})` : cClinic?.name;
                  const isActive = search.c === c.id;

                  return (
                    <div
                      key={c.id}
                      className={cn(
                        "p-4 flex items-center gap-3 cursor-pointer transition-colors",
                        isActive ? "bg-primary-soft/50" : "hover:bg-muted/50",
                      )}
                      onClick={() => {
                        navigate({ to: "/messages", search: { c: c.id } });
                      }}
                    >
                      <div className="relative shrink-0">
                        <Initials name={title ?? "Clinic"} className="h-10 w-10 text-xs" />
                        {c.unreadForPatient > 0 && !isActive && (
                          <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full border-2 border-card bg-primary" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <h3
                            className={cn(
                              "font-medium truncate text-sm",
                              c.unreadForPatient > 0 && !isActive && "font-bold text-foreground",
                            )}
                          >
                            {title}
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
                        <p
                          className={cn(
                            "text-xs truncate",
                            c.unreadForPatient > 0 && !isActive
                              ? "font-medium text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          {last
                            ? last.sender === "patient"
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
                  onClick={() => navigate({ to: "/messages" })}
                  className="md:hidden p-2 -ml-2 text-muted-foreground"
                >
                  <ArrowLeft className="h-5 w-5" />
                </button>
                <Initials name={activeTitle ?? "Clinic"} className="h-9 w-9 text-xs" />
                <div className="min-w-0">
                  <h2 className="font-semibold text-sm truncate">{activeTitle}</h2>
                  <p className="text-xs text-muted-foreground truncate">
                    {activeConversation.kind === "appointment"
                      ? "Appointment Query"
                      : "General Inquiry"}
                  </p>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                <div className="text-center">
                  <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">
                    Messages are for clinic communication. Not for medical emergencies.
                  </span>
                </div>

                {activeConversation.messages.map((m) => {
                  const isMe = m.sender === "patient";
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
                    placeholder="Type a message..."
                    className="flex-1 max-h-32 min-h-10 resize-none bg-transparent px-3 py-2 text-sm outline-none"
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
    </PatientShell>
  );
}

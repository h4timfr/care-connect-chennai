import { createFileRoute } from "@tanstack/react-router";
import { Bot, Sparkles, Send, User } from "lucide-react";
import { PatientShell } from "@/components/layout/PatientShell";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/store";

export const Route = createFileRoute("/assistant")({
  component: AssistantView,
});

type ChatMessage = {
  id: string;
  role: "user" | "ai";
  content: string;
};

function AssistantView() {
  const { patient } = useApp();
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "1",
      role: "ai",
      content:
        "Hi! I'm the CareConnect Assistant. I can help you find doctors, check clinic availability, and schedule appointments. What are you looking for today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;

    const userMsg = input.trim();
    setMessages((prev) => [...prev, { id: Date.now().toString(), role: "user", content: userMsg }]);
    setInput("");
    setIsTyping(true);

    setTimeout(() => {
      let aiResponse =
        "I'm a demo assistant. In a real application, I would connect to a large language model to help you book appointments or answer logistical questions based on clinic data.";

      if (
        userMsg.toLowerCase().includes("orthopedic") &&
        userMsg.toLowerCase().includes("evening")
      ) {
        aiResponse =
          "I found Dr. Karthik Subramanian (Orthopedics) at Anna Nagar Ortho & Physio Centre. He has evening availability starting at 5:00 PM today. Would you like me to show you his profile or help you book?";
      }

      setMessages((prev) => [
        ...prev,
        { id: (Date.now() + 1).toString(), role: "ai", content: aiResponse },
      ]);
      setIsTyping(false);
    }, 1500);
  };

  return (
    <PatientShell>
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col h-[calc(100vh-140px)] min-h-[400px] border rounded-xl overflow-hidden bg-card shadow-sm">
          <div className="p-4 border-b flex items-center gap-3 bg-primary-soft/30">
            <div className="h-10 w-10 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display font-semibold text-lg flex items-center gap-2">
                Appointment Assistant <Sparkles className="h-4 w-4 text-primary" />
              </h1>
              <p className="text-xs text-muted-foreground">Logistics & Booking Help</p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            <div className="text-center">
              <span className="text-[10px] uppercase tracking-wider font-medium text-muted-foreground bg-muted px-2 py-1 rounded-full">
                Not for medical advice
              </span>
            </div>

            {messages.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "flex gap-3 max-w-[85%]",
                  m.role === "user" ? "ml-auto flex-row-reverse" : "mr-auto",
                )}
              >
                <div className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
                  {m.role === "ai" ? <Bot className="h-4 w-4" /> : <User className="h-4 w-4" />}
                </div>
                <div
                  className={cn(
                    "px-4 py-2.5 rounded-2xl text-sm leading-relaxed",
                    m.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-sm"
                      : "bg-muted text-foreground rounded-tl-sm",
                  )}
                >
                  {m.content}
                </div>
              </div>
            ))}

            {isTyping && (
              <div className="flex gap-3 max-w-[85%] mr-auto">
                <div className="shrink-0 h-8 w-8 rounded-full flex items-center justify-center bg-muted text-muted-foreground">
                  <Bot className="h-4 w-4" />
                </div>
                <div className="px-4 py-3 rounded-2xl bg-muted rounded-tl-sm flex gap-1">
                  <span className="h-1.5 w-1.5 bg-foreground/30 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                  <span className="h-1.5 w-1.5 bg-foreground/30 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                  <span className="h-1.5 w-1.5 bg-foreground/30 rounded-full animate-bounce"></span>
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>

          <form onSubmit={handleSend} className="p-3 border-t bg-background">
            <div className="flex items-end gap-2 bg-muted/50 rounded-xl p-1.5 border focus-within:border-primary focus-within:ring-1 focus-within:ring-primary/20 transition-all">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="E.g. I need an orthopedic doctor near Velachery tomorrow evening..."
                className="flex-1 max-h-32 min-h-[44px] resize-none bg-transparent px-3 py-3 text-sm outline-none"
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
                className="h-10 w-10 rounded-lg shrink-0 mb-0.5 mr-0.5"
                disabled={!input.trim()}
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </form>
        </div>
      </div>
    </PatientShell>
  );
}

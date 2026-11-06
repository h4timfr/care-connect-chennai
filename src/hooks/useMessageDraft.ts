import { useEffect, useRef, useState } from "react";

/** In-memory composer for a keyed identity/conversation. Never persists healthcare text. */
export function useMessageDraft() {
  const [text, setValue] = useState("");
  const [sending, setSending] = useState(false);
  const revision = useRef(0);
  const inFlight = useRef(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      revision.current += 1;
    };
  }, []);

  const setText = (value: string) => {
    revision.current += 1;
    setValue(value);
  };
  const send = async (submit: (body: string) => Promise<unknown>) => {
    const body = text.trim();
    if (!body || inFlight.current) return;
    inFlight.current = true;
    const submittedRevision = revision.current;
    setSending(true);
    try {
      await submit(body);
      if (mounted.current && revision.current === submittedRevision) setValue("");
    } catch (error) {
      // A previous recipient's request must not interrupt the newly opened conversation.
      if (mounted.current) throw error;
    } finally {
      inFlight.current = false;
      if (mounted.current) setSending(false);
    }
  };
  return { text, setText, sending, send };
}

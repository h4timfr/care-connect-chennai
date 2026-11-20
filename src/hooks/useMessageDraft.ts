import { useEffect, useRef, useState } from "react";

interface Draft {
  text: string;
  revision: number;
  sending: boolean;
  error: string;
}

const emptyDraft: Draft = { text: "", revision: 0, sending: false, error: "" };

/** One inbox owns these in-memory drafts. Its identity key controls their lifetime. */
export function useMessageDraft(conversationId: string | undefined) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const inFlight = useRef(new Set<string>());
  const attempts = useRef(new Map<string, { body: string; id: string }>());
  const currentId = useRef(conversationId);
  currentId.current = conversationId;
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const draft = (conversationId && drafts[conversationId]) || emptyDraft;
  const update = (id: string, change: (previous: Draft) => Draft) => {
    if (!mounted.current) return;
    setDrafts((previous) => ({ ...previous, [id]: change(previous[id] ?? emptyDraft) }));
  };
  const setText = (value: string) => {
    if (conversationId) {
      update(conversationId, (previous) => ({
        ...previous,
        text: value,
        revision: previous.revision + 1,
      }));
    }
  };
  const send = async (
    submit: (body: string, messageId: string) => Promise<unknown>,
    describeError: (problem: unknown) => string,
    notifyError?: (message: string) => void,
  ) => {
    const id = conversationId;
    const body = draft.text.trim();
    if (!id || !body || inFlight.current.has(id)) return;
    const previousAttempt = attempts.current.get(id);
    const attempt =
      previousAttempt?.body === body ? previousAttempt : { body, id: crypto.randomUUID() };
    attempts.current.set(id, attempt);
    inFlight.current.add(id);
    update(id, (previous) => ({ ...previous, sending: true, error: "" }));
    try {
      await submit(body, attempt.id);
      attempts.current.delete(id);
      update(id, (previous) =>
        previous.revision === draft.revision ? { ...previous, text: "" } : previous,
      );
    } catch (problem) {
      if (mounted.current) {
        const error = describeError(problem);
        update(id, (previous) => ({ ...previous, error }));
        if (currentId.current === id) notifyError?.(error);
      }
    } finally {
      inFlight.current.delete(id);
      update(id, (previous) => ({ ...previous, sending: false }));
    }
  };
  return { text: draft.text, setText, sending: draft.sending, error: draft.error, send };
}

import { AuthClient, type Session } from "@supabase/supabase-js";

export async function updateRecoveryPassword(
  authUrl: URL,
  publishableKey: string,
  session: Session,
  password: string,
  send: typeof fetch,
) {
  const storageKey = `careconnect.recovery:${crypto.randomUUID()}`;
  const client = new AuthClient({
    url: authUrl.href,
    headers: { apikey: publishableKey },
    storageKey,
    storage: {
      getItem: (key) => (key === storageKey ? JSON.stringify(session) : null),
      setItem: () => {},
      removeItem: () => {},
    },
    persistSession: true,
    autoRefreshToken: false,
    detectSessionInUrl: false,
    skipAutoInitialize: true,
    fetch: send,
  });
  try {
    return await client.updateUser({ password });
  } finally {
    await client.dispose();
  }
}

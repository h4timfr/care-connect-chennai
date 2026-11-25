import {
  AuthRetryableFetchError,
  type Session,
  type SupportedStorage,
} from "@supabase/supabase-js";

type Snapshot = { value: string | null; revision: string | null };
type Candidate = { accessToken: string; refreshToken?: string; previous: Snapshot | null };

export class SupersededAuthSessionError extends AuthRetryableFetchError {
  constructor() {
    super("The authenticated session changed before the operation completed.", 409);
  }
}

function decodeSession(value: string | null): Session | null {
  try {
    const session = value ? (JSON.parse(value) as Session | null) : null;
    return session &&
      typeof session.access_token === "string" &&
      typeof session.refresh_token === "string" &&
      typeof session.user?.id === "string"
      ? session
      : null;
  } catch {
    return null;
  }
}

function sessionId(accessToken: string): unknown {
  try {
    const claims = accessToken.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
    return claims ? (JSON.parse(atob(claims)) as { session_id?: string }).session_id : undefined;
  } catch {
    return undefined;
  }
}

export function sharedAuthStorage(key: string, authUrl: URL) {
  let storage: Storage;
  try {
    if (
      typeof navigator === "undefined" ||
      !navigator.locks ||
      typeof BroadcastChannel === "undefined"
    )
      return undefined;
    storage = window.localStorage;
    storage.getItem(key);
    const probe = `careconnect.storage-probe:${crypto.randomUUID()}`;
    if (storage.getItem(probe) !== null) return undefined;
    try {
      storage.setItem(probe, "1");
      if (storage.getItem(probe) !== "1") return undefined;
    } finally {
      storage.removeItem(probe);
    }
    if (storage.getItem(probe) !== null) return undefined;
  } catch {
    return undefined;
  }

  const adoptionKey = `careconnect.signup-adoption:${key}`;
  const revisionKey = `careconnect.auth-revision:${key}`;
  const locked = <T>(action: () => T) => navigator.locks.request(key, action);
  const read = (): Snapshot => ({
    value: storage.getItem(key),
    revision: storage.getItem(revisionKey),
  });
  const isCurrent = (previous: Snapshot) =>
    storage.getItem(revisionKey) === previous.revision && storage.getItem(key) === previous.value;
  const write = (value: string | null) => {
    storage.removeItem(adoptionKey);
    if (value === null) {
      storage.removeItem(key);
      // Keep the last login generation so an older operation that started signed out
      // also sees the intervening login after that login has been signed out.
    } else {
      storage.setItem(revisionKey, crypto.randomUUID());
      storage.setItem(key, value);
    }
  };
  const publishSignOut = () => {
    const channel = new BroadcastChannel(key);
    channel.postMessage({ event: "SIGNED_OUT", session: null });
    channel.close();
  };

  // The SDK serializes refreshes within one client. Each guarded transport records the exact
  // response that is eligible to commit. No credential is added to shared browser storage.
  const candidates = new Map<"refresh" | "callback", Candidate>();
  const adapter: SupportedStorage = {
    getItem: (item) => {
      const value = storage.getItem(item);
      return item === key && !decodeSession(value) ? null : value;
    },
    setItem: (item, value) => {
      if (item !== key) return storage.setItem(item, value);
      const session = decodeSession(value);
      if (!session) throw new Error("Invalid Auth session.");
      const matching = [...candidates].filter(
        ([, candidate]) =>
          candidate.accessToken === session?.access_token &&
          (candidate.refreshToken === undefined ||
            candidate.refreshToken === session.refresh_token),
      );
      return locked(() => {
        for (const [kind, candidate] of matching) {
          if (candidates.get(kind) === candidate) candidates.delete(kind);
          if (!candidate.previous || !isCurrent(candidate.previous))
            throw new SupersededAuthSessionError();
        }
        write(value);
      });
    },
    // The SDK may call removeItem after a revoked-token response or to undo a refresh.
    // An unqualified SDK cleanup has no proof of ownership of the shared session slot.
    removeItem: (item) => {
      if (item !== key) storage.removeItem(item);
    },
  };

  const guardedFetch: typeof fetch = async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : input);
    const sameAuth = url.origin === authUrl.origin;
    const grant = url.searchParams.get("grant_type");
    const isToken = sameAuth && url.pathname === authUrl.pathname + "/token";
    const refresh = isToken && grant === "refresh_token";
    const pkce = isToken && grant === "pkce";
    // The main client no longer calls getUser for React verification. Its explicit-JWT
    // user lookup is the SDK's implicit URL login (confirmation or password recovery).
    const callback =
      sameAuth && url.pathname === authUrl.pathname + "/user" && init?.method === "GET";
    if (!refresh && !pkce && !callback) return globalThis.fetch(input, init);

    const previous = await locked(read);
    const old = decodeSession(previous.value);
    const refreshInput =
      refresh && typeof init?.body === "string"
        ? (JSON.parse(init.body) as { refresh_token?: string }).refresh_token
        : undefined;
    const ownsRefresh = !!old && !!refreshInput && old.refresh_token === refreshInput;
    const response = await globalThis.fetch(input, init);

    if (response.ok) {
      if (callback) {
        const authorization = new Headers(init?.headers).get("Authorization");
        if (authorization?.startsWith("Bearer ")) {
          candidates.set("callback", { accessToken: authorization.slice(7), previous });
        }
      } else {
        const body = decodeSession(JSON.stringify(await response.clone().json()));
        if (body) {
          candidates.set(refresh ? "refresh" : "callback", {
            accessToken: body.access_token,
            refreshToken: body.refresh_token,
            previous: !refresh || ownsRefresh ? previous : null,
          });
        }
      }
    } else if (
      refresh &&
      ownsRefresh &&
      old.expires_at &&
      old.expires_at * 1000 <= Date.now() &&
      [400, 401, 403].includes(response.status)
    ) {
      // Clear only the expired session that started this failed refresh. SDK cleanup that
      // follows this response cannot remove a replacement session.
      await locked(() => {
        if (isCurrent(previous)) write(null);
      });
    }
    return response;
  };

  return {
    adapter,
    fetch: guardedFetch,
    matchesOwner(ownerId: string | undefined) {
      try {
        return decodeSession(storage.getItem(key))?.user.id === ownerId;
      } catch {
        return false;
      }
    },
    async snapshotFor(accessToken: string) {
      return locked(() => {
        const snapshot = read();
        return decodeSession(snapshot.value)?.access_token === accessToken ? snapshot : null;
      });
    },
    isCurrent,
    async dispatchIfCurrent(snapshot: Snapshot, dispatch: () => Promise<Response>) {
      const started = await locked(() => {
        if (!isCurrent(snapshot)) throw new SupersededAuthSessionError();
        // Start the request under the lock without holding it for the network response.
        return { response: dispatch() };
      });
      return started.response;
    },
    async discard(snapshot: Snapshot) {
      return locked(() => {
        if (!isCurrent(snapshot)) return false;
        write(null);
        publishSignOut();
        return true;
      });
    },
    async takeSession(expected: Session) {
      return locked(() => {
        const session = decodeSession(storage.getItem(key));
        if (session?.user.id !== expected.user.id) return null;
        const expectedId = sessionId(expected.access_token);
        if (
          session.access_token !== expected.access_token &&
          (typeof expectedId !== "string" || sessionId(session.access_token) !== expectedId)
        )
          return null;
        write(null);
        publishSignOut();
        return session;
      });
    },
    async adoptionStorage(isCurrentAttempt: () => boolean) {
      const ticket = await locked(() => {
        if (!isCurrentAttempt() || decodeSession(storage.getItem(key))) return null;
        const reservation = crypto.randomUUID();
        storage.setItem(adoptionKey, reservation);
        return reservation;
      });
      if (!ticket) return null;

      return (ownerId: string): SupportedStorage => ({
        getItem: () => null,
        removeItem: () => {},
        setItem: (item, value) =>
          locked(() => {
            if (
              item !== key ||
              !isCurrentAttempt() ||
              decodeSession(storage.getItem(key)) ||
              storage.getItem(adoptionKey) !== ticket ||
              decodeSession(value)?.user.id !== ownerId
            ) {
              throw new SupersededAuthSessionError();
            }
            write(value);
          }),
      });
    },
  };
}

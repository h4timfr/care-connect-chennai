import type { SignUpWithPasswordCredentials } from "@supabase/supabase-js";
import { authSessionStorage, createProviderAuthClient } from "./client";

export async function signUpProvider(
  credentials: SignUpWithPasswordCredentials,
  isCurrent: () => boolean,
) {
  const adoption = await authSessionStorage?.adoptionStorage(isCurrent).catch(() => null);
  const client = createProviderAuthClient();
  try {
    const response = await client.signUp(credentials);
    const { data, error } = response;
    if (error || !data.session || !data.user?.id || data.session.user.id !== data.user.id) {
      return { ...response, adopt: undefined };
    }

    const ownerId = data.user.id;
    const session = data.session;
    const adopt = adoption
      ? async () => {
          if (!isCurrent()) return false;
          const adopter = createProviderAuthClient(adoption(ownerId));
          try {
            const result = await adopter.setSession({
              access_token: session.access_token,
              refresh_token: session.refresh_token,
            });
            return !result.error && result.data.user?.id === ownerId;
          } catch {
            return false;
          } finally {
            await adopter.dispose();
          }
        }
      : undefined;
    return { ...response, adopt };
  } finally {
    await client.dispose();
  }
}

import assert from "node:assert/strict";
import test from "node:test";
import type { Session } from "@supabase/supabase-js";
import { updateRecoveryPassword } from "../src/lib/supabase/recovery-password";

const url = new URL("https://recovery-test.invalid/auth/v1");
const user: Session["user"] = {
  id: "synthetic-recovery-user",
  app_metadata: {},
  user_metadata: {},
  aud: "authenticated",
  created_at: "2026-01-01T00:00:00Z",
};
const session: Session = {
  user,
  access_token: "synthetic-access",
  refresh_token: "synthetic-refresh",
  token_type: "bearer",
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
};

test("installed SDK sends the pinned recovery bearer and discards response credentials", async () => {
  let requests = 0;
  const result = await updateRecoveryPassword(
    url,
    "synthetic-public",
    session,
    "synthetic-password",
    async (input, init) => {
      requests++;
      assert.equal(String(input), `${url}/user`);
      assert.equal(init?.method, "PUT");
      assert.equal(
        new Headers(init?.headers).get("Authorization") === "Bearer synthetic-access",
        true,
      );
      return Response.json({ ...user, access_token: "synthetic-rotation" });
    },
  );
  assert.equal(requests, 1);
  assert.equal(result.error, null);
  assert.equal(session.access_token === "synthetic-access", true);
});

test("installed SDK preserves server password policy errors", async () => {
  const result = await updateRecoveryPassword(
    url,
    "synthetic-public",
    session,
    "synthetic-password",
    async () =>
      Response.json(
        { code: "weak_password", msg: "Mock password policy rejection" },
        { status: 422, headers: { "X-Supabase-Api-Version": "2024-01-01" } },
      ),
  );
  assert.equal(result.error?.code, "weak_password");
});

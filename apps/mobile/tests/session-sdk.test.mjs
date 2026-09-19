import assert from "node:assert/strict";
import { test } from "node:test";
import { createClient } from "@supabase/supabase-js";

test("the pinned auth SDK removes persisted credentials on local logout even when revocation is unavailable", async () => {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const access = `${encode({ alg: "HS256" })}.${encode({ exp: expires })}.fixture`;
  const user = {
    id: "00000000-0000-4000-8000-000000000001",
    aud: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-09-19T00:00:00Z",
  };
  const storage = new Map([
    [
      "nest.auth.v1",
      JSON.stringify({
        access_token: access,
        refresh_token: "fixture-refresh",
        expires_at: expires,
        expires_in: 3600,
        token_type: "bearer",
        user,
      }),
    ],
  ]);
  const calls = [];
  const client = createClient("https://fixture.example", "sb_publishable_fixture", {
    global: {
      fetch: async (url) => {
        calls.push(url);
        return Response.json({ message: "Unavailable" }, { status: 503 });
      },
    },
    auth: {
      storageKey: "nest.auth.v1",
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      storage: {
        getItem: async (key) => storage.get(key) ?? null,
        setItem: async (key, value) => {
          storage.set(key, value);
        },
        removeItem: async (key) => {
          storage.delete(key);
        },
      },
    },
  });
  const restored = await client.auth.getSession();
  assert.equal(restored.data.session.user.id, user.id);
  const result = await client.auth.signOut({ scope: "local" });
  assert.ok(result.error);
  assert.ok(calls.some((url) => String(url).includes("/logout?scope=local")));
  assert.equal(storage.has("nest.auth.v1"), false);
  assert.equal((await client.auth.getSession()).data.session, null);
  await client.auth.stopAutoRefresh();
});

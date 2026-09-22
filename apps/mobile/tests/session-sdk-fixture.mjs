import { createClient } from "@supabase/supabase-js";

export function sdkFixture({
  expiresIn = 3600,
  wrapStorage = (storage) => ({ storage }),
  fetcher,
} = {}) {
  const expires = Math.floor(Date.now() / 1000) + expiresIn;
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
  let failure = null;
  const persistence = wrapStorage({
    getItem: async (key) => {
      if (failure === "read") throw new Error("Fixture Keychain read failure");
      return storage.get(key) ?? null;
    },
    setItem: async (key, value) => {
      storage.set(key, value);
    },
    removeItem: async (key) => {
      if (failure === "delete") throw new Error("Fixture Keychain deletion failure");
      storage.delete(key);
    },
  });
  const client = createClient("https://fixture.example", "sb_publishable_fixture", {
    global: {
      fetch: async (url, init) => {
        calls.push(url);
        if (fetcher) return fetcher(url, init);
        return Response.json({ message: "Unavailable" }, { status: 503 });
      },
    },
    auth: {
      storageKey: "nest.auth.v1",
      autoRefreshToken: false,
      persistSession: true,
      detectSessionInUrl: false,
      storage: persistence.storage,
    },
  });
  return {
    client,
    identity: persistence.identity,
    beginLogout: persistence.beginLogout,
    beginSignIn: persistence.beginSignIn,
    logoutCredentials: persistence.logoutCredentials,
    storage,
    calls,
    user,
    fail: (value) => {
      failure = value;
    },
  };
}

import * as Effect from "effect/Effect";
import * as Apple from "expo-apple-authentication";
import * as Crypto from "expo-crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { SessionFailure } from "./contracts";

export const signInWithApple = (auth: SupabaseClient["auth"]) =>
  Effect.tryPromise({
    try: async () => {
      if (!(await Apple.isAvailableAsync())) throw new Error("Apple unavailable");
      const nonce = Crypto.randomUUID();
      const state = Crypto.randomUUID();
      const hashed = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, nonce);
      const credential = await Apple.signInAsync({ nonce: hashed, state, requestedScopes: [] });
      if (!credential.identityToken || credential.state !== state)
        throw new Error("Invalid credential");
      const { data, error } = await auth.signInWithIdToken({
        provider: "apple",
        token: credential.identityToken,
        nonce,
      });
      if (error) throw error;
      if (!data.session) throw new Error("Missing session");
      return data.session;
    },
    catch: (error) =>
      new SessionFailure({
        code:
          typeof error === "object" &&
          error !== null &&
          "code" in error &&
          error.code === "ERR_REQUEST_CANCELED"
            ? "cancelled"
            : "unavailable",
      }),
  });

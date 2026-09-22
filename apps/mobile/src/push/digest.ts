import * as Effect from "effect/Effect";
import * as Crypto from "expo-crypto";
import { PreferenceFailure } from "../preferences/client.ts";
export const nativePushDigest = (input: string) =>
  Effect.tryPromise({
    try: () => Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, input),
    catch: () => new PreferenceFailure({ code: "unavailable" }),
  });

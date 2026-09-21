import * as Crypto from "expo-crypto";
import * as Effect from "effect/Effect";
import { PreferenceFailure } from "../preferences/client";
import type { ReceiptStorage } from "./receipt-upload-client";
export function nativeReceiptStorage(config: {
  supabaseUrl: string;
  publishableKey: string;
}): ReceiptStorage {
  return {
    origin: config.supabaseUrl,
    upload: {
      publishableKey: config.publishableKey,
      digest: (bytes) =>
        Effect.tryPromise({
          try: () =>
            Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, new Uint8Array(bytes)).then(
              (value) =>
                Array.from(new Uint8Array(value), (byte) =>
                  byte.toString(16).padStart(2, "0"),
                ).join(""),
            ),
          catch: () => new PreferenceFailure({ code: "unavailable" }),
        }),
    },
  };
}

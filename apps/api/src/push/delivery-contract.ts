import type * as Effect from "effect/Effect";
import type { ApiFailure } from "../errors.ts";

export type PushSender = {
  send: (deliveryId: string) => Effect.Effect<"skipped" | "recorded", ApiFailure>;
};

/** Only historical ticket providers expose polling; APNs never supplies this port. */
export type PushReceiptReader = {
  receipt: (input: unknown) => Effect.Effect<"pending" | "recorded", ApiFailure>;
};

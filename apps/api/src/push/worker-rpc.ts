import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import * as Redacted from "effect/Redacted";
import * as Headers from "effect/unstable/http/Headers";
import * as HttpClient from "effect/unstable/http/HttpClient";
import * as FetchHttpClient from "effect/unstable/http/FetchHttpClient";
import * as HttpBody from "effect/unstable/http/HttpBody";
import { ApiFailure } from "../errors.ts";
import { validateConfig } from "../config.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
const methods = {
  mealMaintain: "nest_maintain_meal_reminders",
  mealReadCheckpoint: "nest_read_meal_push_checkpoint",
  mealSaveCheckpoint: "nest_save_meal_push_checkpoint",
  mealScan: "nest_scan_meal_push_deliveries",
  groceryMaintain: "nest_maintain_grocery_reminders",
  recurringMaintain: "nest_maintain_recurring_reminders",
  groceryReadCheckpoint: "nest_read_grocery_push_checkpoint",
  recurringReadCheckpoint: "nest_read_recurring_push_checkpoint",
  grocerySaveCheckpoint: "nest_save_grocery_push_checkpoint",
  recurringSaveCheckpoint: "nest_save_recurring_push_checkpoint",
  groceryScan: "nest_scan_grocery_push_deliveries",
  recurringScan: "nest_scan_recurring_push_deliveries",
  choreMaintain: "nest_maintain_chore_reminders",
  choreReadCheckpoint: "nest_read_chore_push_checkpoint",
  choreSaveCheckpoint: "nest_save_chore_push_checkpoint",
  choreScan: "nest_scan_chore_push_deliveries",
  summaryMaintain: "nest_maintain_daily_summaries",
  summaryReadCheckpoint: "nest_read_summary_push_checkpoint",
  summarySaveCheckpoint: "nest_save_summary_push_checkpoint",
  summaryScan: "nest_scan_summary_push_deliveries",
  maintain: "nest_maintain_push_deliveries",
  readCheckpoint: "nest_read_push_checkpoint",
  saveCheckpoint: "nest_save_push_checkpoint",
  scan: "nest_scan_push_deliveries",
  begin: "nest_begin_push_delivery",
  finishSend: "nest_finish_push_send",
  finishReceipt: "nest_finish_push_receipt",
  claimReceipts: "nest_claim_push_receipt_polls",
  retry: "nest_retry_push_delivery",
};
export function pushWorkerRpc(config: IdentityConfig, secret: Redacted.Redacted<string>) {
  const validated = validateConfig(config);
  if (!/^sb_secret_[A-Za-z0-9_-]+$(?![\s\S])/.test(Redacted.value(secret)))
    throw new Error("Push worker requires a server-only Supabase secret key");
  return (method: keyof typeof methods, input: unknown) =>
    Effect.gen(function* () {
      const response = yield* HttpClient.post(
        new URL(`rest/v1/rpc/${methods[method]}`, validated.url),
        { headers: { apikey: Redacted.value(secret) }, body: yield* HttpBody.json(input) },
      );
      if (response.status === 401 || response.status === 403)
        return yield* new ApiFailure({ code: "forbidden" });
      if (response.status < 200 || response.status >= 300) {
        const error = yield* Schema.decodeUnknownEffect(Schema.Struct({ code: Schema.String }))(
          yield* response.json,
        );
        return yield* new ApiFailure({
          code: ["PT412", "40001", "55P03", "55000"].includes(error.code)
            ? "conflict"
            : "unavailable",
        });
      }
      return yield* response.json;
    }).pipe(
      Effect.timeout("10 seconds"),
      Effect.mapError((error) =>
        Schema.is(ApiFailure)(error) ? error : new ApiFailure({ code: "unavailable" }),
      ),
      Effect.provide(FetchHttpClient.layer),
      Effect.updateService(Headers.CurrentRedactedNames, (names) => [...names, "apikey"]),
      Effect.provideService(FetchHttpClient.RequestInit, { redirect: "error" }),
    );
}

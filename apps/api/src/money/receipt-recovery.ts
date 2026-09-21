import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ReceiptRecoveryQuery, ReceiptRecovery } from "@nest/contracts/receipt-recovery";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
export function readReceiptUploads(
  config: IdentityConfig,
  caller: AuthorizedCaller,
  input: unknown,
) {
  return Effect.gen(function* () {
    const query = yield* Schema.decodeUnknownEffect(ReceiptRecoveryQuery)(input, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "invalid_request" })));
    const after = query.after?.toLowerCase() ?? null;
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_read_receipt_uploads", {
      p_household: caller.member.householdId,
      p_after: after,
    });
    const result = yield* Schema.decodeUnknownEffect(ReceiptRecovery)(raw, {
      onExcessProperty: "error",
    }).pipe(Effect.mapError(() => new ApiFailure({ code: "unavailable" })));
    if (
      result.householdId !== caller.member.householdId ||
      result.uploaderId !== caller.member.userId ||
      result.after !== after
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return result;
  });
}

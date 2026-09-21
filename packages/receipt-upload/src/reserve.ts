import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { ReceiptUploadInput, ReceiptUploadReservation } from "@nest/contracts/receipt-upload";
import type { UploadCaller } from "./identity.ts";
import {
  receiptRequest,
  responseJson,
  responseFailure,
  decodeFailure,
  type UploadConfig,
} from "./http.ts";
import { ReceiptUploadFailure } from "./bytes.ts";
const equivalent = Schema.toEquivalence(ReceiptUploadInput);
export function reserveUpload(
  config: UploadConfig,
  caller: UploadCaller,
  input: ReceiptUploadInput,
) {
  return Effect.gen(function* () {
    const response = yield* receiptRequest(
      config,
      caller.token,
      "rest/v1/rpc/nest_reserve_receipt_upload",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ p_household: caller.householdId, p_input: input }),
      },
    );
    if (!response.ok) return yield* reservationFailure(response);
    const value = yield* Schema.decodeUnknownEffect(ReceiptUploadReservation)(
      yield* responseJson(response),
      { onExcessProperty: "error" },
    ).pipe(Effect.mapError(decodeFailure));
    if (
      value.householdId !== caller.householdId ||
      value.uploaderId !== caller.userId ||
      !equivalent(input, value)
    )
      return yield* new ReceiptUploadFailure({ code: "unavailable" });
    return value;
  });
}

function reservationFailure(response: Response) {
  return Effect.gen(function* () {
    if ([401, 403, 404, 409, 410].includes(response.status))
      return yield* responseFailure(response);
    const raw = yield* responseJson(response);
    const value = yield* Schema.decodeUnknownEffect(Schema.Struct({ code: Schema.String }))(
      raw,
    ).pipe(Effect.mapError(decodeFailure));
    const code = ["40001", "55P03", "55000", "P0002"].includes(value.code)
      ? "conflict"
      : value.code === "22023"
        ? "invalid"
        : "unavailable";
    return yield* new ReceiptUploadFailure({ code });
  });
}

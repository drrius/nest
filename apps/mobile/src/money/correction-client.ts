import { CorrectionContext, CorrectionContextQuery } from "@nest/contracts/correction-context";
import {
  SaveCorrection,
  CorrectionInput,
  CorrectionReceipt,
  canonicalCorrection,
} from "@nest/contracts/correction";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export type CorrectionSave = typeof SaveCorrection.Type;
const equivalent = Schema.toEquivalence(CorrectionInput);
export function correctionClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    correctionContext: (sourceEventId: string) =>
      Effect.gen(function* () {
        const query = yield* Schema.decodeUnknownEffect(CorrectionContextQuery)({
          sourceEventId,
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const source = query.sourceEventId.toLowerCase();
        const value = yield* request(
          `v1/money/correction/context?${new URLSearchParams({ sourceEventId: source })}`,
          CorrectionContext,
        );
        if (
          value.householdId !== account.household ||
          value.source.event.eventId !== source ||
          !value.source.shares.some((share) => share.memberId === account.actor)
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return value;
      }),
    saveCorrection: (input: CorrectionSave) =>
      Effect.gen(function* () {
        const value = yield* Schema.decodeUnknownEffect(SaveCorrection)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const operationId = value.operationId.toLowerCase(),
          correction = canonicalCorrection(value.correction);
        const receipt = yield* request("v1/money/correction/save", CorrectionReceipt, {
          operationId,
          correction,
        });
        if (
          receipt.actorId !== account.actor ||
          receipt.householdId !== account.household ||
          receipt.operationId !== operationId ||
          receipt.approvalId !== null ||
          !equivalent(receipt.correction, correction)
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return receipt;
      }),
  };
}

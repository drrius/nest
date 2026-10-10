import { CorrectionContext, CorrectionContextQuery } from "@nest/contracts/correction-context";
import { CorrectionSaveResult } from "@nest/contracts/correction-save-read";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { SaveCorrection, CorrectionInput, CorrectionReceipt } from "@nest/contracts/correction";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
import { canonicalCorrection } from "@nest/contracts/correction";
export type CorrectionSave = typeof SaveCorrection.Type;
const equivalent = Schema.toEquivalence(CorrectionInput);
export function correctionClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const status = (input: CorrectionSave, cancel: boolean) =>
    Effect.gen(function* () {
      const command = yield* prepare(input);
      const value = yield* cancel
        ? request("v1/money/correction/cancel", CorrectionSaveResult, {
            operationId: command.operationId,
          })
        : request(
            `v1/money/correction/receipt?${new URLSearchParams({ operationId: command.operationId })}`,
            CorrectionSaveResult,
          );
      if (
        value.actorId !== account.actor ||
        value.householdId !== account.household ||
        value.operationId !== command.operationId
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      if (value.receipt !== null && !equivalent(value.receipt.correction, command.correction))
        return yield* new PreferenceFailure({ code: "unavailable" });
      if (cancel && value.status === "unresolved")
        return yield* new PreferenceFailure({ code: "unavailable" });
      return value;
    });
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
    recoverCorrection: (input: CorrectionSave) => status(input, false),
    cancelCorrection: (input: CorrectionSave) => status(input, true),
    saveCorrection: (input: CorrectionSave) =>
      Effect.gen(function* () {
        const { operationId, correction } = yield* prepare(input);
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

function prepare(input: CorrectionSave) {
  return Schema.decodeUnknownEffect(SaveCorrection)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
    Effect.map((command) => ({
      operationId: command.operationId.toLowerCase(),
      correction: canonicalCorrection(command.correction),
    })),
  );
}

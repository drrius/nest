import { SettlementSaveResult } from "@nest/contracts/settlement-save-read";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { SaveSettlement, SettlementInput, SettlementReceipt } from "@nest/contracts/settlement";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
import { canonicalSettlement } from "@nest/contracts/settlement";
export type SettlementSave = typeof SaveSettlement.Type;
const equivalent = Schema.toEquivalence(SettlementInput);
export function settlementClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const status = (input: SettlementSave, cancel: boolean) =>
    Effect.gen(function* () {
      const command = yield* prepare(input);
      const value = yield* cancel
        ? request("v1/money/settlement/cancel", SettlementSaveResult, {
            operationId: command.operationId,
          })
        : request(
            `v1/money/settlement/receipt?${new URLSearchParams({ operationId: command.operationId })}`,
            SettlementSaveResult,
          );
      if (
        value.actorId !== account.actor ||
        value.householdId !== account.household ||
        value.operationId !== command.operationId
      )
        return yield* new PreferenceFailure({ code: "unavailable" });
      if (value.receipt !== null && !equivalent(value.receipt.settlement, command.settlement))
        return yield* new PreferenceFailure({ code: "unavailable" });
      if (cancel && value.status === "unresolved")
        return yield* new PreferenceFailure({ code: "unavailable" });
      return value;
    });
  return {
    recoverSettlement: (input: SettlementSave) => status(input, false),
    cancelSettlement: (input: SettlementSave) => status(input, true),
    saveSettlement: (input: SettlementSave) =>
      Effect.gen(function* () {
        const { operationId, settlement } = yield* prepare(input);
        const receipt = yield* request("v1/money/settlement/save", SettlementReceipt, {
          operationId,
          settlement,
        });
        if (
          receipt.actorId !== account.actor ||
          receipt.householdId !== account.household ||
          receipt.operationId !== operationId ||
          receipt.approvalId !== null ||
          !equivalent(receipt.settlement, settlement)
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return receipt;
      }),
  };
}

function prepare(input: SettlementSave) {
  return Schema.decodeUnknownEffect(SaveSettlement)(input, { onExcessProperty: "error" }).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
    Effect.map((command) => ({
      operationId: command.operationId.toLowerCase(),
      settlement: canonicalSettlement(command.settlement),
    })),
  );
}

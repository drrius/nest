import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  SaveSettlement,
  SettlementInput,
  SettlementReceipt,
  canonicalSettlement,
} from "@nest/contracts/settlement";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export type SettlementSave = typeof SaveSettlement.Type;
const equivalent = Schema.toEquivalence(SettlementInput);
export function settlementClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    saveSettlement: (input: SettlementSave) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(SaveSettlement)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const operationId = command.operationId.toLowerCase(),
          settlement = canonicalSettlement(command.settlement);
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

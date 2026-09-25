import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { effectTool, CommandFailure } from "@nest/ai/tool";
import type { ReceiptDeviceHandoff } from "@nest/contracts/receipt";
import { currentMember } from "../identity.ts";
import { supabaseIdentity, type IdentityConfig } from "../supabase-identity.ts";

export function receiptHandoffTools(request: Request, config: IdentityConfig) {
  const handoff = (screen: typeof ReceiptDeviceHandoff.Type.screen, description: string) =>
    effectTool({
      description,
      input: Schema.Struct({}),
      execute: () =>
        currentMember(request).pipe(
          Effect.as({ kind: "device_handoff" as const, screen }),
          Effect.provide(supabaseIdentity(config)),
          Effect.mapError(
            (error) =>
              new CommandFailure({
                code: error.code === "unavailable" ? "unavailable" : "forbidden",
              }),
          ),
        ),
    });
  return {
    openReceiptUploads: handoff(
      "receipt-uploads",
      "Open native receipt upload review when asked to inspect uploads left after an interrupted expense form or remove an unattached upload. Navigation only: reads no files, lists no upload metadata to the assistant, removes nothing and posts no money. The member must inspect current authorized data and explicitly confirm any removal on the device. Claimed financial receipts remain retained.",
    ),
    openReceiptExpense: handoff(
      "expense-entry",
      "Open the native ordinary expense form when the member wants to choose or upload a receipt for a new expense. Navigation only: opens no picker, uploads no file, fills no financial fields, grants no approval and posts no expense. The member selects a photo or PDF, reviews the amount/payer/split and explicitly saves using native controls. Do not claim a receipt was attached or money saved. For a grocery expense use openGroceryReceiptExpense.",
    ),
    openGroceryReceiptExpense: handoff(
      "grocery-expense",
      "Open the native grocery expense form to select a receipt and enter its total separately from the shared amount. Navigation only: opens no picker, uploads no file, fills no amounts, checks no grocery and posts no money. The member must choose the receipt, review payer and split of the shared amount, and explicitly save on the device. Checking groceries never authorizes an expense.",
    ),
  };
}

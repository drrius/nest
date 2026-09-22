import * as Schema from "effect/Schema";
import {
  CreateRenewalInput,
  EditRenewalInput,
  RemoveRenewalInput,
  RenewalReceipt,
  canonicalRenewalCommand,
  sameRenewalCommand,
} from "@nest/contracts/renewals";
export function matchesRenewalReceipt(
  action: string,
  input: object,
  receipt: object,
  member: { userId: string; householdId: string },
): boolean | null {
  if (!["createRenewal", "editRenewal", "removeRenewal"].includes(action)) return null;
  if (
    !Schema.is(RenewalReceipt)(receipt) ||
    receipt.actorId !== member.userId ||
    receipt.householdId !== member.householdId
  )
    return false;
  const command = expectedCommand(action, input, receipt.operationId);
  return command !== null && sameRenewalCommand(canonicalRenewalCommand(command), receipt.command);
}
function expectedCommand(action: string, input: object, operationId: string) {
  if (action === "createRenewal")
    return Schema.is(CreateRenewalInput)(input)
      ? { operationId, renewalId: operationId, expectedRevision: null, fields: input.fields }
      : null;
  const schema = action === "editRenewal" ? EditRenewalInput : RemoveRenewalInput;
  return Schema.is(schema)(input) ? { ...input, operationId } : null;
}

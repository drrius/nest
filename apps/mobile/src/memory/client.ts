import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  ProposeMemory,
  DecideMemory,
  RemoveMemory,
  MemoryApprovalEnvelope,
  MemoryDecisionEnvelope,
  MemoryRemovalEnvelope,
  MemoriesEnvelope,
  type MemoryReceipt,
} from "@nest/contracts/memory";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
const requireMatch = <A>(value: A, matches: boolean) =>
  matches ? Effect.succeed(value) : Effect.fail(new PreferenceFailure({ code: "unavailable" }));
const validate = <A>(schema: Schema.Codec<A>, input: unknown) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
  );
export function memoryClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const scoped = <A extends { actorId: string; householdId: string }>(
    path: string,
    schema: Schema.Codec<A>,
    input?: object,
  ) =>
    request(path, schema, input).pipe(
      Effect.flatMap((value) =>
        requireMatch(
          value,
          value.actorId === account.actor && value.householdId === account.household,
        ),
      ),
    );
  return {
    list: () => scoped("v1/memories", MemoriesEnvelope).pipe(Effect.map((value) => value.memories)),
    approval: (id: string) =>
      validate(MemoryApprovalEnvelope.fields.approval.fields.id, id).pipe(
        Effect.flatMap(() =>
          scoped(`v1/memories/approval?id=${encodeURIComponent(id)}`, MemoryApprovalEnvelope),
        ),
        Effect.flatMap(({ approval }) => requireMatch(approval, approval.id === id.toLowerCase())),
      ),
    propose: (input: ProposeMemory) =>
      validate(ProposeMemory, input).pipe(
        Effect.flatMap((command) => scoped("v1/memories/propose", MemoryApprovalEnvelope, command)),
        Effect.flatMap(({ approval }) =>
          requireMatch(
            approval,
            approval.operationId === input.operationId.toLowerCase() &&
              approval.change.memoryId === input.memoryId.toLowerCase() &&
              approval.change.expectedRevision === input.expectedRevision &&
              approval.change.content === input.content,
          ),
        ),
      ),
    decide: (input: DecideMemory) =>
      validate(DecideMemory, input).pipe(
        Effect.flatMap((command) => scoped("v1/memories/decide", MemoryDecisionEnvelope, command)),
        Effect.flatMap(({ decision }) =>
          requireMatch(
            decision,
            decision.status === "consumed"
              ? input.approved && receiptMatches(decision.receipt, input, account, false)
              : !input.approved,
          ),
        ),
      ),
    remove: (input: RemoveMemory) =>
      validate(RemoveMemory, input).pipe(
        Effect.flatMap((command) => scoped("v1/memories/remove", MemoryRemovalEnvelope, command)),
        Effect.flatMap(({ receipt }) =>
          requireMatch(receipt, receiptMatches(receipt, input, account, true)),
        ),
      ),
  };
}
function receiptMatches(
  receipt: MemoryReceipt,
  input: RemoveMemory,
  account: Account,
  removed: boolean,
) {
  return (
    receipt.actorId === account.actor &&
    receipt.householdId === account.household &&
    receipt.operationId === input.operationId.toLowerCase() &&
    receipt.memoryId === input.memoryId.toLowerCase() &&
    BigInt(receipt.revision) === BigInt(input.expectedRevision) + 1n &&
    receipt.removed === removed
  );
}
export type MemoryClient = ReturnType<typeof memoryClient>;

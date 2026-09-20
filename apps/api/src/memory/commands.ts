import * as Effect from "effect/Effect";
import {
  ProposeMemory,
  DecideMemory,
  RemoveMemory,
  MemoryApproval,
  MemoryDecision,
  MemoryReceipt,
} from "@nest/contracts/memory";
import { ApiFailure } from "../errors.ts";
import { requestJson } from "../supabase-request.ts";
import type { AuthorizedCaller } from "../chores/service.ts";
import type { IdentityConfig } from "../supabase-identity.ts";
import { decode } from "./codec.ts";
import { memoryReads } from "./read.ts";
export function memoryCommands(config: IdentityConfig, caller: AuthorizedCaller) {
  return {
    propose: (input: unknown) => propose(config, caller, input),
    decide: (input: unknown) => decide(config, caller, input),
    remove: (input: unknown) => remove(config, caller, input),
  };
}
function propose(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const command = yield* decode(ProposeMemory, input, "invalid_request");
    const change = {
      memoryId: command.memoryId.toLowerCase(),
      expectedRevision: command.expectedRevision,
      content: command.content,
    };
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_propose_action", {
      p_household: caller.member.householdId,
      p_invocation: command.operationId.toLowerCase(),
      p_command: "memory.save",
      p_version: 1,
      p_payload: change,
    });
    const id = yield* decode(MemoryApproval.fields.id, raw);
    const approval = yield* memoryReads(config, caller).approval(id);
    if (
      approval.operationId !== command.operationId.toLowerCase() ||
      approval.change.memoryId !== change.memoryId ||
      approval.change.expectedRevision !== change.expectedRevision ||
      approval.change.content !== change.content
    )
      return yield* new ApiFailure({ code: "unavailable" });
    return approval;
  });
}
function decide(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const command = yield* decode(DecideMemory, input, "invalid_request");
    const raw = yield* requestJson(config, caller.token, "rest/v1/rpc/nest_decide_memory", {
      ...argumentsFor(command, caller),
      p_content: command.content,
      p_approval: command.approvalId.toLowerCase(),
      p_approved: command.approved,
    });
    const decision = yield* decode(MemoryDecision, raw);
    if ((decision.status === "consumed") !== command.approved)
      return yield* new ApiFailure({ code: "unavailable" });
    if (decision.status === "consumed" && !matchesReceipt(decision.receipt, command, caller, false))
      return yield* new ApiFailure({ code: "unavailable" });
    return decision;
  });
}
function remove(config: IdentityConfig, caller: AuthorizedCaller, input: unknown) {
  return Effect.gen(function* () {
    const command = yield* decode(RemoveMemory, input, "invalid_request");
    const raw = yield* requestJson(
      config,
      caller.token,
      "rest/v1/rpc/nest_remove_memory",
      argumentsFor(command, caller),
    );
    const receipt = yield* decode(MemoryReceipt, raw);
    if (!matchesReceipt(receipt, command, caller, true))
      return yield* new ApiFailure({ code: "unavailable" });
    return receipt;
  });
}
function argumentsFor(command: RemoveMemory, caller: AuthorizedCaller) {
  return {
    p_household: caller.member.householdId,
    p_operation: command.operationId.toLowerCase(),
    p_memory: command.memoryId.toLowerCase(),
    p_expected: command.expectedRevision,
  };
}
function matchesReceipt(
  receipt: MemoryReceipt,
  command: RemoveMemory,
  caller: AuthorizedCaller,
  removed: boolean,
) {
  return (
    receipt.actorId === caller.member.userId &&
    receipt.householdId === caller.member.householdId &&
    receipt.operationId === command.operationId.toLowerCase() &&
    receipt.memoryId === command.memoryId.toLowerCase() &&
    receipt.revision === String(BigInt(command.expectedRevision) + 1n) &&
    receipt.removed === removed
  );
}

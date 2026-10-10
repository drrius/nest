import { canonicalLegacyAdoption } from "@nest/contracts/legacy-adoption-command";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { LegacyAdoptionInput } from "@nest/contracts/legacy-adoption-command";
import {
  DecideLegacyAdoption,
  LegacyAdoptionApprovalEnvelope,
  LegacyAdoptionApprovalQuery,
} from "@nest/contracts/legacy-adoption-approval";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
export type LegacyAdoptionDecision = typeof DecideLegacyAdoption.Type;
export type LegacyAdoptionApproval = LegacyAdoptionApprovalEnvelope["approval"];
const equivalent = Schema.toEquivalence(LegacyAdoptionInput);
const validate = <A>(schema: Schema.Codec<A>, input: unknown) =>
  Schema.decodeUnknownEffect(schema, { onExcessProperty: "error" })(input).pipe(
    Effect.mapError(() => new PreferenceFailure({ code: "invalid" })),
  );
const requireMatch = <A>(value: A, matches: boolean) =>
  matches ? Effect.succeed(value) : Effect.fail(new PreferenceFailure({ code: "unavailable" }));
export function legacyAdoptionApprovalClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  const scoped = (path: string, approvalId: string, input?: object) =>
    request(path, LegacyAdoptionApprovalEnvelope, input).pipe(
      Effect.flatMap((result) =>
        requireMatch(
          result.approval,
          result.actorId === account.actor &&
            result.householdId === account.household &&
            result.approval.id === approvalId,
        ),
      ),
    );
  return {
    legacyAdoptionApproval: (approvalId: string) =>
      validate(LegacyAdoptionApprovalQuery, { approvalId }).pipe(
        Effect.flatMap((query) => {
          const target = query.approvalId.toLowerCase();
          return scoped(
            `v1/money/recurring/legacy-adoption/approval?${new URLSearchParams({ approvalId: target })}`,
            target,
          );
        }),
      ),
    decideLegacyAdoption: (input: LegacyAdoptionDecision) =>
      Effect.gen(function* () {
        const command = yield* validate(DecideLegacyAdoption, input);
        const cycle = canonicalLegacyAdoption(command.input);
        const approvalId = command.approvalId.toLowerCase();
        const operationId = command.operationId.toLowerCase();
        const result = yield* scoped(
          "v1/money/recurring/legacy-adoption/approval/decide",
          approvalId,
          {
            ...command,
            approvalId,
            operationId,
            input: cycle,
          },
        );
        return yield* requireMatch(
          result,
          result.operationId === operationId &&
            equivalent(result.input, cycle) &&
            (command.approved
              ? result.status === "consumed"
              : ["consumed", "denied"].includes(result.status)),
        );
      }),
  };
}

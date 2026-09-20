import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import {
  CreateRoutine,
  EditRoutine,
  RoutineList,
  RoutineCreateEnvelope,
} from "@nest/contracts/routines";
import { preferenceRequests, PreferenceFailure } from "../preferences/client.ts";
import type { Account } from "../offline/contracts.ts";
import type { Credentials } from "../session/verification.ts";
import type { ChoreFailure } from "../chores/client.ts";
export type RoutineSnapshot = typeof RoutineList.Type;
export function routineClient(
  apiUrl: string,
  account: Account,
  credentials: Effect.Effect<Credentials, ChoreFailure>,
) {
  const request = preferenceRequests(apiUrl, account, credentials);
  return {
    read: () =>
      request("v1/routines", RoutineList).pipe(
        Effect.flatMap((snapshot) => {
          const ids = snapshot.members.map((member) => member.actorId);
          if (
            snapshot.householdId !== account.household ||
            !ids.includes(account.actor) ||
            new Set(ids).size !== ids.length ||
            new Set(snapshot.routines.map((routine) => routine.routineId)).size !==
              snapshot.routines.length
          )
            return Effect.fail(new PreferenceFailure({ code: "forbidden" }));
          return Effect.succeed(snapshot);
        }),
      ),
    edit: (input: EditRoutine) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(EditRoutine)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const { receipt } = yield* request("v1/routines/edit", RoutineCreateEnvelope, command);
        if (
          receipt.actorId !== account.actor ||
          receipt.householdId !== account.household ||
          receipt.operationId !== command.operationId.toLowerCase() ||
          receipt.routineId !== command.routineId.toLowerCase() ||
          receipt.action !== "edit"
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return receipt;
      }),
    create: (input: CreateRoutine) =>
      Effect.gen(function* () {
        const command = yield* Schema.decodeUnknownEffect(CreateRoutine)(input, {
          onExcessProperty: "error",
        }).pipe(Effect.mapError(() => new PreferenceFailure({ code: "invalid" })));
        const { receipt } = yield* request("v1/routines/create", RoutineCreateEnvelope, command);
        if (
          receipt.actorId !== account.actor ||
          receipt.householdId !== account.household ||
          receipt.operationId !== command.operationId.toLowerCase() ||
          receipt.action !== "create"
        )
          return yield* new PreferenceFailure({ code: "unavailable" });
        return receipt;
      }),
  };
}
export type RoutineClient = ReturnType<typeof routineClient>;

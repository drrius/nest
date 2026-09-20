import * as Effect from "effect/Effect";
import type { Chore } from "@nest/contracts/chores";
import type { makeOfflineStore } from "../offline/service.ts";
import type { Session } from "../offline/contracts.ts";
import { ChoreFailure, type ChoreClient } from "./client.ts";

export type ChoreStore = ReturnType<typeof makeOfflineStore>;
export function choreFlow(store: ChoreStore, session: Session, client: ChoreClient) {
  const replay = Effect.gen(function* () {
    let notice: string | null = null;
    for (let count = 0; count < 200; count++) {
      const wire = yield* store.prepare(session, "chore.complete");
      if (!wire || wire.kind !== "chore.complete") break;
      const result = yield* client
        .complete({
          operationId: wire.operation,
          occurrenceId: wire.target,
          expectedDueDate: wire.expected,
          completedOn: wire.completedOn,
        })
        .pipe(Effect.result);
      if (result._tag === "Failure") {
        yield* rejectAttempt({ store, session, client }, wire, result.failure);
        continue;
      }
      yield* store.acknowledge(session, {
        operation: wire.operation,
        version: wire.expected,
        value: true,
      });
      notice =
        result.success.outcome === "already_completed"
          ? result.success.completedBy === session.actor
            ? "This chore was already completed."
            : "Your partner had already completed this chore."
          : "Chore completed.";
    }
    return notice;
  });
  return {
    actor: session.actor,
    read: store.readChores(session),
    requestTransfer: client.requestTransfer,
    respondTransfer: client.respondTransfer,
    skip: client.skip,
    reschedule: client.reschedule,
    sync: Effect.gen(function* () {
      const notice = yield* replay;
      const { chores, ...transfers } = yield* client.snapshot();
      yield* store.saveChores(session, chores, transfers);
      return notice;
    }),
    complete: (chore: Chore, operation: string, completedOn: string) =>
      store.enqueue(session, {
        kind: "chore.complete",
        operation,
        target: chore.occurrenceId,
        expected: chore.dueDate,
        completedOn,
      }),
    discard: (operation: string) => store.discardConflict(session, operation),
  };
}
export type ChoreFlow = ReturnType<typeof choreFlow>;
export type ChoreData = Effect.Success<ChoreFlow["read"]>;

function rejectAttempt(
  { store, session, client }: { store: ChoreStore; session: Session; client: ChoreClient },
  wire: { operation: string; target: string },
  failure: ChoreFailure,
) {
  return Effect.gen(function* () {
    if (failure.code === "conflict" || failure.code === "invalid") {
      yield* store.conflict(session, wire.operation, "changed");
    } else if (failure.code === "forbidden") {
      // Distinguish a rejected item from lost membership before proceeding.
      // A fresh authorized read must succeed; denial retains the uncertain queue.
      const rows = yield* client.list();
      yield* store.conflict(
        session,
        wire.operation,
        rows.some((row) => row.occurrenceId === wire.target) ? "access_revoked" : "removed",
      );
    } else return yield* failure;
  });
}

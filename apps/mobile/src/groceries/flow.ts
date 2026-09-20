import * as Effect from "effect/Effect";
import type { Grocery } from "@nest/contracts/groceries";
import type { OfflineAccount } from "../offline/owner.ts";
import { type GroceryClient } from "./client.ts";

export function groceryFlow({ store, session }: OfflineAccount, client: GroceryClient) {
  const sync = Effect.gen(function* () {
    let notice: string | null = null;
    for (let count = 0; count < 500; count++) {
      const wire = yield* store.prepare(session, "groceries.setChecked");
      if (!wire || wire.kind !== "groceries.setChecked") break;
      const result = yield* client
        .check({
          operationId: wire.operation,
          itemId: wire.target,
          expectedVersion: wire.expected,
          checked: wire.checked,
        })
        .pipe(Effect.result);
      if (result._tag === "Failure") {
        const code = result.failure.code;
        if (code === "removed" || code === "conflict" || code === "invalid") {
          yield* store.conflict(
            session,
            wire.operation,
            code === "removed" ? "removed" : "changed",
          );
          continue;
        }
        return yield* result.failure;
      }
      yield* store.acknowledge(session, {
        operation: wire.operation,
        version: result.success.version,
        value: result.success.checked,
        canRebase: result.success.outcome === "applied" || result.success.version === wire.expected,
      });
      notice = "Grocery changes saved.";
    }
    const items = yield* client.list();
    yield* store.saveGroceries(session, items);
    return notice;
  });
  return {
    read: store.readGroceries(session),
    sync,
    check: (item: Grocery, checked: boolean, operation: string) =>
      store.enqueue(session, {
        operation,
        kind: "groceries.setChecked",
        target: item.itemId,
        expected: item.version,
        checked,
      }),
    discard: (operation: string) => store.discardConflict(session, operation),
  };
}
export type GroceryFlow = ReturnType<typeof groceryFlow>;
export type GroceryData = Effect.Success<GroceryFlow["read"]>;

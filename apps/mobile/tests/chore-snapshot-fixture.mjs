import * as Effect from "effect/Effect";
// Existing unit controls adapt to the wire shape; PostgreSQL tests prove consistency.
/** @this {import("../src/chores/client.ts").ChoreClient} */
export function fixtureChoreSnapshot() {
  return this.list().pipe(
    Effect.flatMap((chores) =>
      this.listTransfers().pipe(Effect.map((transfers) => ({ ...transfers, chores }))),
    ),
  );
}

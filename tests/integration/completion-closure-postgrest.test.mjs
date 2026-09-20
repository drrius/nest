import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../../apps/api/src/handler.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { completionClosureFiles } from "../database/completion-closure-files.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("real completion API reports archived conflict and preserves committed replay after archive", async (t) => {
  const fixture = await postgrestFixture(t, [
    ...completionClosureFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const handler = createHandler({ url: fixture.url, publishableKey: "sb_publishable_fixture" });
  const create = (op) => {
    const r = JSON.parse(
      fixture.db
        .sql(`set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}';
      select public.nest_create_routine('${id(10)}','${id(op)}','{"title":"API closure","schedule":{"kind":"daily"},"assignment":{"policy":"shared"}}')`),
    );
    const row = JSON.parse(
      fixture.db.sql(
        `select row_to_json(o) from public.routine_occurrences o where routine_id='${r.routineId}' and role='current'`,
      ),
    );
    return { r, row };
  };
  const archive = (r) =>
    fixture.db.sql(
      `set role authenticated; set request.jwt.claims='${JSON.stringify({ sub: id(1) })}'; select public.archive_routine('${r.routineId}')`,
    );
  const complete = (row, op, bearer = fixture.bearer) =>
    handler(
      new Request("http://localhost/v1/chores/complete", {
        method: "POST",
        headers: {
          authorization: `Bearer ${bearer}`,
          "content-type": "application/json",
          "x-nest-household": id(10),
        },
        body: JSON.stringify({
          operationId: id(op),
          occurrenceId: row.id,
          expectedDueDate: row.due_date,
          completedOn: row.due_date,
        }),
      }),
    );
  const first = create(100);
  archive(first.r);
  assert.equal((await complete(first.row, 101)).status, 409);
  assert.equal((await complete(first.row, 101, fixture.otherBearer)).status, 403);
  const second = create(102);
  const response = await complete(second.row, 103);
  assert.equal(response.status, 200);
  const receipt = await response.json();
  archive(second.r);
  assert.deepEqual(await (await complete(second.row, 103)).json(), receipt);
  assert.equal(
    fixture.db.sql(
      `select count(*) from public.routine_completions where occurrence_id='${second.row.id}'`,
    ),
    "1",
  );
});

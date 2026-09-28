import { choreEpochFiles } from "./offline-epoch-files.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { postgrestFixture } from "./postgrest-fixture.mjs";
import { choreTransferFiles } from "../database/chore-transfer-files.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
export async function calendarChoreFixture(t) {
  const f = await postgrestFixture(t, [
    ...choreTransferFiles,
    "tests/integration/food-postgrest.sql",
    ...choreEpochFiles,
  ]);
  const config = { url: f.url, publishableKey: "sb_publishable_fixture" };
  const handler = createHandler(config);
  const request = (query, bearer = f.bearer) =>
    new Request(`http://localhost/v1/calendar/chores?${query}`, {
      headers: { authorization: `Bearer ${bearer}`, "x-nest-household": id(10) },
    });
  const read = (query, bearer) => handler(request(query, bearer));
  const definition = {
    title: "Kitchen",
    schedule: { kind: "daily" },
    assignment: { policy: "assigned", memberId: id(1) },
  };
  const created = JSON.parse(
    f.db.sql(
      `set role authenticated; set request.jwt.claims='{"sub":"${id(1)}"}'; select public.nest_create_routine('${id(10)}','${id(100)}','${JSON.stringify(definition)}'::jsonb)`,
    ),
  );
  const rows = JSON.parse(
    f.db.sql(
      `select json_agg(o order by role) from public.routine_occurrences o where routine_id='${created.routineId}'`,
    ),
  );
  return { f, config, request, read, created, rows };
}

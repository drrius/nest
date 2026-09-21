import { postgrestFixture } from "./postgrest-fixture.mjs";
import { lostResponseProxy } from "./lost-response-proxy.mjs";
import { nodeServer } from "../../apps/api/node-server.mjs";
import { createHandler } from "../../apps/api/src/handler.ts";
import { recipeSelectionFiles, command, id, week } from "../database/recipe-selection-fixture.mjs";
export { id, week };
export async function fixture(t, lossy = false, extraFiles = []) {
  const remote = await postgrestFixture(t, [
    ...recipeSelectionFiles,
    "tests/database/meal-ingredient-groceries-fixture.sql",
    "supabase/migrations/20260921081205_native_meal_ingredient_additions.sql",
    "supabase/migrations/20260921081725_native_meal_ingredient_review.sql",
    ...extraFiles,
    "tests/integration/food-postgrest.sql",
  ]);
  const placed = JSON.parse(
    remote.db.sql(`set request.jwt.claims='{"sub":"${id(1)}"}'; ${command(id(800))}`),
  );
  const upstream = lossy
    ? await lostResponseProxy(t, remote.url, "/rest/v1/rpc/nest_add_meal_ingredients")
    : remote;
  const server = nodeServer(
    createHandler({ url: upstream.url, publishableKey: "sb_publishable_fixture" }),
  );
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(
    () =>
      new Promise((resolve) => {
        server.close(resolve);
        server.closeAllConnections();
      }),
  );
  const url = `http://127.0.0.1:${server.address().port}/v1/meals/ingredients/`;
  const headers = (bearer = remote.bearer) => ({
    authorization: `Bearer ${bearer}`,
    "x-nest-household": id(10),
    "content-type": "application/json",
  });
  const post = (path, value, bearer) =>
    fetch(url + path, {
      method: "POST",
      headers: headers(bearer),
      body: JSON.stringify(value),
    });
  const query = { weekStart: week, expectedRevision: placed.revision, after: null };
  return { remote, placed, upstream, url, headers, post, query };
}

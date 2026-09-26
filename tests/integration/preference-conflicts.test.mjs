import assert from "node:assert/strict";
import { test } from "node:test";
import { files } from "./preference-files.mjs";
import { postgrestFixture } from "./postgrest-fixture.mjs";
const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
test("private and shared preference version mismatches are non-retryable with no writes", async (t) => {
  const f = await postgrestFixture(t, files);
  const cases = [
    {
      name: "nest_save_food_profile",
      fields: { p_restrictions: [], p_dislikes: [], p_calorie_goal: null, p_portions: 1 },
      table: "nest_food_profiles",
    },
    {
      name: "nest_save_cooking_preferences",
      fields: { p_notes: "", p_slots: ["dinner"] },
      table: "nest_cooking_preferences",
    },
    {
      name: "nest_save_notification_preferences",
      fields: { p_daily_enabled: false, p_daily_time: "08:00", p_items_enabled: false },
      table: "nest_notification_preferences",
    },
  ];
  for (const { name, fields, table } of cases) {
    const response = await fetch(`${f.url}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { authorization: `Bearer ${f.bearer}`, "content-type": "application/json" },
      body: JSON.stringify({
        p_household: id(10),
        p_operation: id(300),
        p_expected: "9",
        ...fields,
      }),
    });
    assert.equal(response.status, 412, name);
    assert.equal((await response.json()).code, "PT412");
    assert.equal(f.db.sql(`select count(*) from public.${table}`), "0");
  }
});

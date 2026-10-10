import assert from "node:assert/strict";
import test from "node:test";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { structuredGeneration } from "../src/structured.ts";
import { model } from "./fixtures.mjs";

test("JSON generation still validates required fields, bounds and extra fields", async () => {
  const schema = Schema.Struct({
    servings: Schema.Int.check(Schema.isBetween({ minimum: 1, maximum: 4 })),
  });
  for (const value of [{ servings: 0 }, { servings: 1.5 }, {}, { servings: 2, extra: true }]) {
    await assert.rejects(
      Effect.runPromise(
        structuredGeneration({
          model: model([{ type: "text", text: JSON.stringify(value) }]),
          schema,
          instructions: "Synthetic fixture",
          data: {},
        }),
      ),
      { reason: "unavailable" },
    );
  }
  const value = await Effect.runPromise(
    structuredGeneration({
      model: model([{ type: "text", text: '{"servings":2}' }]),
      schema,
      instructions: "Synthetic fixture",
      data: {},
    }),
  );
  assert.deepEqual(value, { servings: 2 });
});

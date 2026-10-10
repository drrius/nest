import assert from "node:assert/strict";
import test from "node:test";
import * as Schema from "effect/Schema";
import { effectSchema } from "../src/schema.ts";

test("provider accepts two-member allocations while Effect retains exact length", async () => {
  const share = Schema.Struct({ actor: Schema.String, centimes: Schema.Int });
  const schema = effectSchema(Schema.Struct({ allocations: Schema.Tuple([share, share]) }));
  const json = await schema.jsonSchema;
  assert.equal(json.properties.allocations.items.type, "object");
  assert.equal(json.properties.allocations.minItems, 2);
  assert.equal(json.properties.allocations.maxItems, 2);
  const a = { actor: "a", centimes: 100 };
  const b = { actor: "b", centimes: 100 };
  assert.equal((await schema.validate({ allocations: [a, b] })).success, true);
  for (const allocations of [[a], [a, b, a], [a, { ...b, centimes: 0.5 }]])
    assert.equal((await schema.validate({ allocations })).success, false);
});

test("heterogeneous tuples fail explicitly rather than weakening positional validation", () => {
  assert.throws(() => effectSchema(Schema.Tuple([Schema.String, Schema.Int])), /homogeneous tuple/);
});

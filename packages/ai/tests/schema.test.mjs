import assert from "node:assert/strict";
import test from "node:test";
import * as Schema from "effect/Schema";
import { Output, generateText } from "ai";
import { effectSchema } from "../src/schema.ts";
import { Input, input, model } from "./fixtures.mjs";

test("SDK schema advertises and enforces the same Effect integer/UUID contract", async () => {
  const adapter = effectSchema(Input);
  const json = await adapter.jsonSchema;
  assert.equal(json.properties.amount.type, "integer");
  assert.equal(json.additionalProperties, false);
  assert.deepEqual(await adapter.validate(input), { success: true, value: input });
  for (const candidate of [
    { ...input, amount: 0.1 },
    { ...input, amount: -1 },
    { ...input, amount: Number.MAX_SAFE_INTEGER + 1 },
    { ...input, operation: "not-a-uuid" },
    { ...input, actor: "forged-user" },
  ]) {
    const invalid = await adapter.validate(candidate);
    assert.equal(invalid.success, false);
    assert.equal(invalid.error.message, "Invalid command input");
  }
});

test("named nested definitions retain their draft-07 references", async () => {
  const member = Schema.Struct({ name: Schema.NonEmptyString }).annotate({ identifier: "Member" });
  const adapter = effectSchema(Schema.Struct({ payer: member, partner: member }));
  const json = await adapter.jsonSchema;
  assert.equal(json.properties.payer.$ref, "#/definitions/Member");
  assert.equal(json.definitions.Member.type, "object");
  assert.equal(
    (await adapter.validate({ payer: { name: "A" }, partner: { name: "" } })).success,
    false,
  );
});

test("structured output uses the Effect decoder through the actual SDK", async () => {
  const schema = effectSchema(
    Schema.Struct({
      meals: Schema.Array(
        Schema.Struct({
          title: Schema.NonEmptyString,
          servings: Schema.Number.check(Schema.isInt(), Schema.isGreaterThan(0)),
        }),
      ).check(Schema.isMinLength(1)),
    }),
  );
  const value = { meals: [{ title: "Lentil soup", servings: 2 }] };
  const generated = await generateText({
    model: model([{ type: "text", text: JSON.stringify(value) }]),
    output: Output.object({ schema }),
    prompt: "Fixture only",
    maxRetries: 0,
  });
  assert.deepEqual(generated.output, value);
  await assert.rejects(
    generateText({
      model: model([{ type: "text", text: '{"meals":[{"title":"Soup","servings":0}]}' }]),
      output: Output.object({ schema }),
      prompt: "Fixture only",
      maxRetries: 0,
    }),
  );
});

import { jsonSchema } from "ai";
import * as Effect from "effect/Effect";
import * as JsonSchema from "effect/JsonSchema";
import * as Schema from "effect/Schema";

// Emit and validate the same canonical JSON codec; no independently maintained Zod schema.
export function effectSchema<S extends Schema.ConstraintCodec<unknown, unknown, never, never>>(
  schema: S,
) {
  const codec = Schema.toCodecJson(schema);
  const document = JsonSchema.toDocumentDraft07(
    Schema.toJsonSchemaDocument(codec, { onExcessProperty: "error" }),
  );
  return jsonSchema<S["Type"]>(
    { ...document.schema, definitions: document.definitions },
    {
      validate: (input) =>
        Schema.decodeUnknownEffect(codec, { onExcessProperty: "error" })(input).pipe(
          Effect.match({
            onSuccess: (value) => ({ success: true as const, value }),
            onFailure: () => ({
              success: false as const,
              error: new Error("Invalid command input"),
            }),
          }),
          Effect.runPromise,
        ),
    },
  );
}

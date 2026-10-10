import type { JsonSchema } from "effect/JsonSchema";

function normalizeValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeValue);
  if (value !== null && typeof value === "object")
    return providerSchema(Object.fromEntries(Object.entries(value)));
  return value;
}

// Provider tool schemas accept homogeneous arrays, not draft-07 tuple items.
export function providerSchema(schema: JsonSchema): JsonSchema {
  const normalized = Object.fromEntries(
    Object.entries(schema).map(([key, value]) => [key, normalizeValue(value)]),
  );
  if (Array.isArray(normalized.items)) {
    const [first, ...rest] = normalized.items;
    if (first === undefined || rest.some((item) => JSON.stringify(item) !== JSON.stringify(first)))
      throw new Error("Provider schema requires a homogeneous tuple");
    normalized.items = first;
    delete normalized.additionalItems;
  }
  return normalized;
}

import * as Schema from "effect/Schema";

export const Uuid = Schema.String.check(Schema.isUUID());
export const GroceryVersion = Schema.String.check(
  Schema.isPattern(/^[1-9][0-9]{0,18}$/),
  Schema.makeFilter((value: string) => BigInt(value) <= 9223372036854775807n),
);
const Name = Schema.String.check(
  Schema.isMinLength(1),
  Schema.isMaxLength(120),
  Schema.makeFilter((value: string) => value.trim().length > 0),
);
const OptionalText = Schema.NullOr(Schema.String.check(Schema.isMaxLength(80)));
const Identity = { operationId: Uuid, itemId: Uuid };
const Fields = {
  name: Name,
  quantity: OptionalText,
  unit: OptionalText,
  categoryId: Schema.NullOr(Uuid),
};
export const AddGrocery = Schema.Struct({ ...Identity, ...Fields });
export const EditGrocery = Schema.Struct({
  ...Identity,
  ...Fields,
  expectedVersion: GroceryVersion,
});
export const RemoveGrocery = Schema.Struct({ ...Identity, expectedVersion: GroceryVersion });
export const CheckGrocery = Schema.Struct({
  ...Identity,
  expectedVersion: GroceryVersion,
  checked: Schema.Boolean,
});
export const Grocery = Schema.Struct({
  categoryName: Schema.optionalKey(Schema.NullOr(Schema.NonEmptyString)),
  itemId: Uuid,
  name: Schema.NonEmptyString,
  quantity: OptionalText,
  unit: OptionalText,
  categoryId: Schema.NullOr(Uuid),
  version: GroceryVersion,
  checked: Schema.Boolean,
  legacyClaimed: Schema.Boolean,
});
export type Grocery = typeof Grocery.Type;
export const GroceryCategory = Schema.Struct({ categoryId: Uuid, name: Schema.NonEmptyString });
export const GroceryReceipt = Schema.Struct({
  operation: Uuid,
  target: Uuid,
  version: GroceryVersion,
  checked: Schema.Boolean,
  removed: Schema.Boolean,
});
export const GroceryCheckReceipt = Schema.Struct({
  operation: Uuid,
  target: Uuid,
  version: GroceryVersion,
  checked: Schema.Boolean,
  outcome: Schema.Literals(["applied", "already_applied"]),
});
export const GroceryList = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  groceries: Schema.Array(Grocery),
});

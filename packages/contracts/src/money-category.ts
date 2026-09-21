import * as Schema from "effect/Schema";
const Uuid = Schema.String.check(Schema.isUUID());
export const MoneyCategoryQuery = Schema.Struct({ categoryId: Uuid });
export const MoneyCategory = Schema.Struct({
  categoryId: Uuid,
  name: Schema.NonEmptyString,
  archived: Schema.Boolean,
});
export const MoneyCategoryEnvelope = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  categoryId: Uuid,
  category: Schema.NullOr(MoneyCategory),
}).check(
  Schema.makeFilter(
    (value) => value.category === null || value.category.categoryId === value.categoryId,
  ),
);
export type MoneyCategory = typeof MoneyCategory.Type;

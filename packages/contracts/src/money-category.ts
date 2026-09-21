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
export const MoneyCategoriesQuery = Schema.Struct({ after: Schema.NullOr(Uuid) });
export const MoneyCategories = Schema.Struct({
  version: Schema.Literal(1),
  householdId: Uuid,
  after: Schema.NullOr(Uuid),
  categories: Schema.Array(MoneyCategory).check(Schema.isMaxLength(50)),
  next: Schema.NullOr(Uuid),
}).check(
  Schema.makeFilter((value) => {
    let previous = value.after ?? "";
    for (const category of value.categories) {
      if (category.archived || category.categoryId <= previous) return false;
      previous = category.categoryId;
    }
    return value.next === null || (value.categories.length === 50 && value.next === previous);
  }),
);

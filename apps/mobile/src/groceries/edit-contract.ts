import * as Schema from "effect/Schema";
import { AddGrocery, EditGrocery, RemoveGrocery } from "@nest/contracts/groceries";

export const GroceryChange = Schema.Union([
  Schema.Struct({ action: Schema.Literal("add"), command: AddGrocery }),
  Schema.Struct({ action: Schema.Literal("edit"), command: EditGrocery }),
  Schema.Struct({ action: Schema.Literal("remove"), command: RemoveGrocery }),
]);
export type GroceryChange = typeof GroceryChange.Type;

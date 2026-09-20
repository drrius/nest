import type { GroceryCategory } from "@nest/contracts/groceries";
import type { GroceryChange } from "./edit-contract.ts";

export function groceryChangeSummary(
  change: GroceryChange,
  categories: readonly (typeof GroceryCategory.Type)[],
) {
  if (change.action === "remove")
    return { title: `Remove: ${change.label ?? change.command.itemId}`, details: [] };
  const category = change.command.categoryId;
  const categoryName = category
    ? (categories.find((row) => row.categoryId === category)?.name ??
      `Saved category (${category})`)
    : "No category";
  return {
    title: `${change.action === "add" ? "Add" : "Edit"}: ${change.command.name}`,
    details: [
      [change.command.quantity, change.command.unit].filter(Boolean).join(" "),
      categoryName,
    ].filter(Boolean),
  };
}

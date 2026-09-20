import type { GroceryData } from "./flow.ts";

export function checklistItems(items: GroceryData["groceries"], showChecked: boolean) {
  return items.filter((item) => showChecked || !item.checked || item.pending || item.conflict);
}

import type { GroceryData } from "./flow.ts";

export function checklistItems(items: GroceryData["groceries"], showChecked: boolean) {
  return items.filter((item) => showChecked || !item.checked || item.pending || item.conflict);
}

export type ChecklistRow =
  | { readonly kind: "category"; readonly key: string; readonly title: string }
  | {
      readonly kind: "grocery";
      readonly key: string;
      readonly item: GroceryData["groceries"][number];
    };

export function checklistRows(
  items: GroceryData["groceries"],
  showChecked: boolean,
  grouped: boolean,
): ChecklistRow[] {
  const visible = checklistItems(items, showChecked);
  if (!grouped) return visible.map(groceryRow);
  const groups = new Map<string, { title: string; items: GroceryData["groceries"] }>();
  for (const item of visible) {
    const known = Boolean(item.categoryId && item.categoryName);
    const key = known ? `category:${item.categoryId}` : "category:other";
    const group = groups.get(key) ?? {
      title: known ? item.categoryName! : "Other groceries",
      items: [],
    };
    group.items.push(item);
    groups.set(key, group);
  }
  return [...groups].flatMap(([key, group]) => [
    { kind: "category" as const, key, title: group.title },
    ...group.items.map(groceryRow),
  ]);
}
function groceryRow(item: GroceryData["groceries"][number]): ChecklistRow {
  return { kind: "grocery", key: item.itemId, item };
}

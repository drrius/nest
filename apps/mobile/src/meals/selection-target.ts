import type { PlacementTarget } from "./placement-runtime.ts";
import { placementTarget } from "./placement-target.ts";
import { replacementTarget } from "./replacement-target.ts";
export type SelectionTarget = PlacementTarget & { readonly entryId?: string };
export function selectionTarget(params: Record<string, unknown>): SelectionTarget | null {
  return params.entryId === undefined ? placementTarget(params) : replacementTarget(params);
}

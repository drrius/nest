import type {
  Memory,
  MemoryApproval,
  ProposeMemory,
  DecideMemory,
  RemoveMemory,
} from "@nest/contracts/memory";
export interface MemoryView {
  readonly items: readonly Memory[];
  readonly approval: MemoryApproval | null;
  readonly loaded: boolean;
  readonly busy: boolean;
  readonly stage: "ready" | "uncertain" | "reload" | "conflict" | "verify";
  readonly notice: string | null;
  readonly generation: number;
}
export type MemoryAttempt =
  | { readonly kind: "propose"; readonly input: ProposeMemory }
  | { readonly kind: "decide"; readonly input: DecideMemory }
  | { readonly kind: "remove"; readonly input: RemoveMemory };
export const initialMemoryView: MemoryView = {
  items: [],
  approval: null,
  loaded: false,
  busy: false,
  stage: "ready",
  notice: null,
  generation: 0,
};
export function approvalCanSave(view: MemoryView) {
  const approval = view.approval;
  if (!approval || !["pending", "approved"].includes(approval.status)) return false;
  const current = view.items.find((item) => item.id === approval.change.memoryId);
  return (
    (current?.revision ?? "0") === approval.change.expectedRevision &&
    (current !== undefined || view.items.length < 64)
  );
}

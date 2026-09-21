import { ExpenseSaveRuntime } from "./save-runtime.ts";
import type { ExpenseSaveOperations } from "./save-operations.ts";
import { ReceiptAttachmentRuntime } from "./receipt-attachment-runtime.ts";
import type { ReceiptAttachmentOperations } from "./receipt-attachment-operations.ts";
export function expenseEntryOwner(
  save: ExpenseSaveOperations,
  attachment: ReceiptAttachmentOperations,
) {
  let current: { save: ExpenseSaveRuntime; attachment: ReceiptAttachmentRuntime } | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      current ??= {
        save: new ExpenseSaveRuntime(save),
        attachment: new ReceiptAttachmentRuntime(attachment),
      };
      return () => {
        listeners.delete(listener);
        if (listeners.size) return;
        current?.save.dispose();
        current?.attachment.dispose();
        current = null;
      };
    },
  };
}

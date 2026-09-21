import type { ExpenseSaveRuntime } from "./save-runtime.ts";
import type { ReceiptAttachmentRuntime } from "./receipt-attachment-runtime.ts";
export function receiptRemovalAllowed(runtime: ExpenseSaveRuntime) {
  const view = runtime.getSnapshot();
  return (
    view.active &&
    view.online &&
    view.fresh &&
    !view.busy &&
    !view.verify &&
    view.attempt === null &&
    view.result === null
  );
}
export function prepareReceiptRemoval(
  attachment: ReceiptAttachmentRuntime,
  expense: ExpenseSaveRuntime,
) {
  const target = attachment.removalTarget();
  if (!target || !receiptRemovalAllowed(expense)) return null;
  return () => {
    if (!receiptRemovalAllowed(expense)) return Promise.resolve();
    return attachment.remove(target);
  };
}

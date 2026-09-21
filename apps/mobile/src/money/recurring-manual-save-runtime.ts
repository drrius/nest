import type { ManualCycleSaveResult } from "@nest/contracts/recurring-manual-read";
import type { ManualCycleSave } from "./recurring-manual-client.ts";
import { manualSaveAttempt } from "./recurring-manual-save-attempt.ts";
import type { ManualCycleSaveOperations } from "./recurring-manual-save-operations.ts";
import { DurableSaveRuntime } from "./durable-save-runtime.ts";
import type { DurableSaveView } from "./durable-save-types.ts";
export type ManualCycleSaveView = DurableSaveView<ManualCycleSave, ManualCycleSaveResult>;
export class ManualCycleSaveRuntime extends DurableSaveRuntime<
  ManualCycleSave,
  ManualCycleSaveResult
> {
  constructor(operations: ManualCycleSaveOperations) {
    super(operations, { prepare: manualSaveAttempt, label: "manual cycle linkage" });
  }
  abandon = this.cancel;
}

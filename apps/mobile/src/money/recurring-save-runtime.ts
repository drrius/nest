import type { RecurringSaveResult } from "@nest/contracts/recurring-save-read";
import type { RecurringSave } from "./recurring-client.ts";
import { saveAttempt } from "./recurring-save-attempt.ts";
import type { RecurringSaveOperations } from "./recurring-save-operations.ts";
import { DurableSaveRuntime } from "./durable-save-runtime.ts";
import type { DurableSaveView } from "./durable-save-types.ts";
export type RecurringSaveView = DurableSaveView<RecurringSave, RecurringSaveResult>;
export class RecurringSaveRuntime extends DurableSaveRuntime<RecurringSave, RecurringSaveResult> {
  constructor(operations: RecurringSaveOperations) {
    super(operations, { prepare: saveAttempt, label: "recurring-rule Save" });
  }
}

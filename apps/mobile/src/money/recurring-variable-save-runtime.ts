import type { VariableCycleSaveResult } from "@nest/contracts/recurring-variable-read";
import type { VariableCycleSave } from "./recurring-variable-client.ts";
import { variableSaveAttempt } from "./recurring-variable-save-attempt.ts";
import type { VariableCycleSaveOperations } from "./recurring-variable-save-operations.ts";
import { DurableSaveRuntime } from "./durable-save-runtime.ts";
import type { DurableSaveView } from "./durable-save-types.ts";
export type VariableCycleSaveView = DurableSaveView<VariableCycleSave, VariableCycleSaveResult>;
export class VariableCycleSaveRuntime extends DurableSaveRuntime<
  VariableCycleSave,
  VariableCycleSaveResult
> {
  constructor(operations: VariableCycleSaveOperations) {
    super(operations, { prepare: variableSaveAttempt, label: "variable bill Save" });
  }
  abandon = this.cancel;
}

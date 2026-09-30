import type { LegacyConfirmationRecovery } from "@nest/contracts/legacy-draft-confirmation";
import type { LegacyConfirmationSave } from "./legacy-confirmation-client.ts";
import { legacyConfirmationAttempt } from "./legacy-confirmation-save-attempt.ts";
import type { LegacyConfirmationSaveOperations } from "./legacy-confirmation-save-operations.ts";
import { DurableSaveRuntime } from "./durable-save-runtime.ts";
import type { DurableSaveView } from "./durable-save-types.ts";
export type LegacyConfirmationSaveView = DurableSaveView<
  LegacyConfirmationSave,
  typeof LegacyConfirmationRecovery.Type
>;
export class LegacyConfirmationSaveRuntime extends DurableSaveRuntime<
  LegacyConfirmationSave,
  typeof LegacyConfirmationRecovery.Type
> {
  constructor(operations: LegacyConfirmationSaveOperations) {
    super(operations, { prepare: legacyConfirmationAttempt, label: "legacy draft confirmation" });
  }
  abandon = this.cancel;
}

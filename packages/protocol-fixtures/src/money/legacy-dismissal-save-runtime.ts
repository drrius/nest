import type { LegacyDismissalRecovery } from "@nest/contracts/legacy-draft-dismissal";
import type { LegacyDismissalSave } from "./legacy-dismissal-client.ts";
import { legacyDismissalAttempt } from "./legacy-dismissal-save-attempt.ts";
import type { LegacyDismissalSaveOperations } from "./legacy-dismissal-save-operations.ts";
import { DurableSaveRuntime } from "./durable-save-runtime.ts";
import type { DurableSaveView } from "./durable-save-types.ts";
export type LegacyDismissalSaveView = DurableSaveView<
  LegacyDismissalSave,
  typeof LegacyDismissalRecovery.Type
>;
export class LegacyDismissalSaveRuntime extends DurableSaveRuntime<
  LegacyDismissalSave,
  typeof LegacyDismissalRecovery.Type
> {
  constructor(operations: LegacyDismissalSaveOperations) {
    super(operations, { prepare: legacyDismissalAttempt, label: "legacy draft dismissal" });
  }
  abandon = this.cancel;
}

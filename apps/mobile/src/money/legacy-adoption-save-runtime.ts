import type { LegacyAdoptionRecovery } from "@nest/contracts/legacy-adoption-command";
import type { LegacyAdoptionSave } from "./legacy-adoption-client.ts";
import { legacyAdoptionAttempt } from "./legacy-adoption-save-attempt.ts";
import type { LegacyAdoptionSaveOperations } from "./legacy-adoption-save-operations.ts";
import { DurableSaveRuntime } from "./durable-save-runtime.ts";
import type { DurableSaveView } from "./durable-save-types.ts";
export type LegacyAdoptionSaveView = DurableSaveView<
  LegacyAdoptionSave,
  typeof LegacyAdoptionRecovery.Type
>;
export class LegacyAdoptionSaveRuntime extends DurableSaveRuntime<
  LegacyAdoptionSave,
  typeof LegacyAdoptionRecovery.Type
> {
  constructor(operations: LegacyAdoptionSaveOperations) {
    super(operations, { prepare: legacyAdoptionAttempt, label: "legacy recurring adoption" });
  }
  abandon = this.cancel;
}

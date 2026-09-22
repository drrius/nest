import type { RenewalCommand, RenewalRecovery } from "@nest/contracts/renewals";
import { renewalAttempt } from "./save-attempt.ts";
import type { RenewalSaveOperations } from "./save-operations.ts";
import { DurableSaveRuntime } from "../money/durable-save-runtime.ts";
export class RenewalSaveRuntime extends DurableSaveRuntime<
  RenewalCommand,
  typeof RenewalRecovery.Type
> {
  constructor(operations: RenewalSaveOperations) {
    super(operations, { prepare: renewalAttempt, label: "renewal change" });
  }
  abandon = this.cancel;
}

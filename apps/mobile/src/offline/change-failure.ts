import * as Schema from "effect/Schema";
import { OfflineFailure } from "./contracts.ts";

export function changeFailure(error: unknown) {
  return Schema.is(OfflineFailure)(error) && error.reason === "queue_full"
    ? "Your saved changes are full. Connect and sync, or review conflicts, before adding more. Existing changes are kept."
    : "Could not save that change on this phone. Please try again.";
}

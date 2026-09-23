import type { ChoreReminderSaveRuntime } from "./save-runtime.ts";
export function reminderNeedsVerification(
  view: ReturnType<ChoreReminderSaveRuntime["getSnapshot"]>,
  context: { verify: boolean },
) {
  // A removed/completed target can deny context while its separately authorized
  // historical operation still needs recovery. Operation authorization wins.
  return view.verify || (context.verify && !view.attempt && !view.result);
}

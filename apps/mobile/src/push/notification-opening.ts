import * as Schema from "effect/Schema";
import { NestNotification } from "../../../../packages/contracts/src/push-notification.ts";
export type NotificationOpeningContext = {
  status: "waiting" | "signed_out" | "ready";
  householdId: string | null;
  actorId: string | null;
  foreground: boolean;
  navigationReady: boolean;
};
/** Native responses are hints; the destination still performs its authorized read. */
export function notificationOpening(options: {
  navigate: (renewalId: string) => void;
  navigateGrocery: (itemId: string) => void;
  navigateMeal: (entryId: string) => void;
  navigateChore: (occurrenceId: string) => void;
  navigateSummary: (summaryId: string) => void;
  consumed: (id: string) => void;
}) {
  let context: NotificationOpeningContext = {
    status: "waiting",
    householdId: null,
    actorId: null,
    foreground: false,
    navigationReady: false,
  };
  let pending: { id: string; payload: NestNotification } | null = null;
  let handled: string | null = null;
  function consume(id: string) {
    pending = null;
    handled = id;
    options.consumed(id);
  }
  function matches(payload: NestNotification) {
    return (
      payload.householdId.toLowerCase() === context.householdId?.toLowerCase() &&
      (payload.kind !== "daily_summary" ||
        payload.recipientId.toLowerCase() === context.actorId?.toLowerCase())
    );
  }
  function navigate(payload: NestNotification) {
    if (payload.kind === "daily_summary") options.navigateSummary(payload.summaryId.toLowerCase());
    else if (payload.kind === "grocery") options.navigateGrocery(payload.itemId.toLowerCase());
    else if (payload.kind === "meal") options.navigateMeal(payload.entryId.toLowerCase());
    else if (payload.kind === "chore") options.navigateChore(payload.occurrenceId.toLowerCase());
    else options.navigate(payload.renewalId.toLowerCase());
  }
  function flush() {
    if (!pending || context.status === "waiting") return;
    const { id, payload } = pending;
    if (context.status === "signed_out" || !matches(payload)) {
      consume(id);
      return;
    }
    if (!context.foreground || !context.navigationReady) return;
    navigate(payload);
    consume(id);
  }
  return {
    receive(id: string, data: unknown) {
      if (!id || id === handled) return;
      const decoded = Schema.decodeUnknownOption(NestNotification, {
        onExcessProperty: "error",
      })(data);
      if (decoded._tag === "None") {
        options.consumed(id);
        return;
      }
      pending = { id, payload: decoded.value };
      flush();
    },
    update(next: NotificationOpeningContext) {
      context = next;
      flush();
    },
  };
}

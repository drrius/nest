import * as Schema from "effect/Schema";
import { RenewalNotification } from "../../../../packages/contracts/src/push-notification.ts";
export type NotificationOpeningContext = {
  status: "waiting" | "signed_out" | "ready";
  householdId: string | null;
  foreground: boolean;
  navigationReady: boolean;
};
/** Native responses are hints; the destination still performs its authorized read. */
export function notificationOpening(options: {
  navigate: (renewalId: string) => void;
  consumed: (id: string) => void;
}) {
  let context: NotificationOpeningContext = {
    status: "waiting",
    householdId: null,
    foreground: false,
    navigationReady: false,
  };
  let pending: { id: string; payload: RenewalNotification } | null = null;
  let handled: string | null = null;
  function consume(id: string) {
    pending = null;
    handled = id;
    options.consumed(id);
  }
  function flush() {
    if (!pending || context.status === "waiting") return;
    const { id, payload } = pending;
    if (
      context.status === "signed_out" ||
      payload.householdId.toLowerCase() !== context.householdId?.toLowerCase()
    ) {
      consume(id);
      return;
    }
    if (!context.foreground || !context.navigationReady) return;
    options.navigate(payload.renewalId.toLowerCase());
    consume(id);
  }
  return {
    receive(id: string, data: unknown) {
      if (!id || id === handled) return;
      const decoded = Schema.decodeUnknownOption(RenewalNotification, {
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

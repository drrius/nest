import type { NotificationClient } from "./client.ts";
import { NotificationRuntime } from "./runtime.ts";
export function notificationOwner(client: NotificationClient, uuid: () => string) {
  let current: NotificationRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new NotificationRuntime(client, uuid);
        void current.load();
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) {
          current?.dispose();
          current = null;
        }
      };
    },
  };
}

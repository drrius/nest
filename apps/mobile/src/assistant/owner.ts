import type { AssistantClient } from "./client.ts";
import { ConversationRuntime } from "./conversation.ts";
// React subscribes to this resource. A fresh runtime is acquired after cleanup,
// including Strict Mode's setup/cleanup/setup, without reviving cancelled work.
export function conversationOwner(client: AssistantClient, id: string, uuid: () => string) {
  let current: ConversationRuntime | null = null;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => current,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      if (!current) {
        current = new ConversationRuntime(client, id, uuid);
        void current.load();
      }
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          current?.dispose();
          current = null;
        }
      };
    },
  };
}

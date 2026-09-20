import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { ConversationSummary } from "@nest/contracts/conversations";
import type { AssistantClient } from "./client.ts";
import { AssistantFailure } from "./request.ts";
interface ListView {
  items: readonly (typeof ConversationSummary.Type)[];
  loaded: boolean;
  busy: boolean;
  error: string | null;
  cursor: string | null;
}
export function conversationList(client: AssistantClient) {
  let view: ListView = { items: [], loaded: false, busy: false, error: null, cursor: null };
  let active: AbortController | null = null;
  const listeners = new Set<() => void>();
  const publish = (patch: Partial<ListView>) => {
    view = { ...view, ...patch };
    for (const listener of listeners) listener();
  };
  const read = async (cursor?: string) => {
    if (active || listeners.size === 0) return;
    const abort = new AbortController();
    active = abort;
    publish({ busy: true, error: null });
    try {
      const page = await Effect.runPromise(client.list(cursor), { signal: abort.signal });
      if (abort.signal.aborted) return;
      const items = cursor
        ? [
            ...new Map(
              [...view.items, ...page.conversations].map((item) => [item.conversationId, item]),
            ).values(),
          ]
        : page.conversations;
      publish({ items, cursor: page.nextCursor, loaded: true });
    } catch (error) {
      if (abort.signal.aborted) return;
      if (Schema.is(AssistantFailure)(error) && ["session", "forbidden"].includes(error.code))
        publish({ items: [], loaded: false, cursor: null });
      publish({ error: "Could not load private conversations. Check your connection and reload." });
    } finally {
      if (active === abort) {
        active = null;
        publish({ busy: false });
      }
    }
  };
  return {
    getSnapshot: () => view,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      void read();
      return () => {
        listeners.delete(listener);
        if (listeners.size === 0) {
          active?.abort();
          active = null;
          view = { items: [], loaded: false, busy: false, error: null, cursor: null };
        }
      };
    },
    refresh: () => {
      void read();
    },
    more: () => {
      if (view.cursor) void read(view.cursor);
    },
  };
}

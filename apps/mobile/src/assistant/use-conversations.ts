import { useState, useSyncExternalStore } from "react";
import type { AssistantClient } from "./client";
import { conversationList } from "./list";
export function useConversations(client: AssistantClient) {
  const [list] = useState(() => conversationList(client));
  const view = useSyncExternalStore(list.subscribe, list.getSnapshot);
  return { ...view, refresh: list.refresh, more: list.more };
}

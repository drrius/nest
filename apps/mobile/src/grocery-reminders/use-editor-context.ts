import { useLayoutEffect, useState } from "react";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { OfflineFailure } from "../offline/contracts";
import { PreferenceFailure } from "../preferences/client";
import { reminderEditorContext, type ReminderEditorContext } from "./editor-context";
type Account = Parameters<typeof reminderEditorContext>[0];
type Clients = Parameters<typeof reminderEditorContext>[1];
export function useReminderEditorContext(
  account: Account,
  clients: Clients,
  itemId: string,
  activity: { active: boolean; online: boolean },
) {
  const { active, online } = activity;
  const [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<{
    value: ReminderEditorContext | null;
    version: number;
    verify: boolean;
    failed: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    if (!active || !online) return;
    const request = new AbortController();
    void Effect.runPromise(reminderEditorContext(account, clients, itemId), {
      signal: request.signal,
    }).then(
      (value) => {
        if (!request.signal.aborted) setLoaded({ value, version, verify: false, failed: false });
      },
      (error) => {
        if (request.signal.aborted) return;
        const verify =
          (Schema.is(OfflineFailure)(error) && error.reason === "session_changed") ||
          (Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code));
        setLoaded({ value: null, version, verify, failed: true });
      },
    );
    return () => {
      request.abort();
      setLoaded((previous) => (previous?.verify ? previous : null));
    };
  }, [account, clients, itemId, active, online, version]);
  return contextView(
    loaded,
    { active, online, version },
    {
      reload: () => setVersion((value) => value + 1),
    },
  );
}
function contextView(
  loaded: {
    value: ReminderEditorContext | null;
    version: number;
    verify: boolean;
    failed: boolean;
  } | null,
  state: { active: boolean; online: boolean; version: number },
  actions: { reload: () => void },
) {
  const { active, online, version } = state;
  if (!loaded) return { value: null, fresh: false, verify: false, failed: false, ...actions };
  const matching = active && online && loaded.version === version;
  return {
    value: active ? loaded.value : null,
    fresh: Boolean(matching && loaded.value),
    verify: loaded.verify,
    failed: Boolean(matching && loaded.failed),
    ...actions,
  };
}

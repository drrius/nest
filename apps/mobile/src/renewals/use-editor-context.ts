import { useLayoutEffect, useState } from "react";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { OfflineFailure } from "../offline/contracts";
import { PreferenceFailure } from "../preferences/client";
import { renewalEditorContext, type RenewalEditorContext } from "./editor-context";
type Account = Parameters<typeof renewalEditorContext>[0];
type Clients = Parameters<typeof renewalEditorContext>[1];
export function useRenewalEditorContext(
  account: Account,
  clients: Clients,
  renewalId: string | null,
  activity: { active: boolean; online: boolean },
) {
  const { active, online } = activity;
  const [after, setAfter] = useState<string | null>(null),
    [version, setVersion] = useState(0);
  const [loaded, setLoaded] = useState<{
    value: RenewalEditorContext | null;
    after: string | null;
    version: number;
    verify: boolean;
    failed: boolean;
  } | null>(null);
  useLayoutEffect(() => {
    if (!active || !online) return;
    const request = new AbortController();
    void Effect.runPromise(renewalEditorContext(account, clients, { renewalId, after }), {
      signal: request.signal,
    }).then(
      (value) => {
        if (!request.signal.aborted)
          setLoaded({ value, after, version, verify: false, failed: false });
      },
      (error) => {
        if (request.signal.aborted) return;
        const verify =
          (Schema.is(OfflineFailure)(error) && error.reason === "session_changed") ||
          (Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code));
        setLoaded({ value: null, after, version, verify, failed: true });
      },
    );
    return () => {
      request.abort();
      setLoaded((previous) => (previous?.verify ? previous : null));
    };
  }, [account, clients, renewalId, active, online, after, version]);
  return contextView(
    loaded,
    { active, online, after, version },
    {
      reload: () => setVersion((value) => value + 1),
      first: () => setAfter(null),
      next: () => setAfter(loaded?.value?.rules.next ?? null),
    },
  );
}
function contextView(
  loaded: {
    value: RenewalEditorContext | null;
    after: string | null;
    version: number;
    verify: boolean;
    failed: boolean;
  } | null,
  state: { active: boolean; online: boolean; after: string | null; version: number },
  actions: { reload: () => void; first: () => void; next: () => void },
) {
  const { active, online, after, version } = state;
  if (!loaded) return { value: null, fresh: false, verify: false, failed: false, ...actions };
  const matching = active && online && loaded.after === after && loaded.version === version;
  return {
    value: active ? loaded.value : null,
    fresh: Boolean(matching && loaded.value),
    verify: loaded.verify,
    failed: Boolean(matching && loaded.failed),
    ...actions,
  };
}

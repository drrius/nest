import { useEffect, useMemo, useState } from "react";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import type { RecurringEntryContext } from "./recurring-entry-context";
import { OfflineFailure } from "../offline/contracts";
import { PreferenceFailure } from "../preferences/client";
import { recurringEntryContext } from "./recurring-entry-context";
import type { MoneyScreenAccount } from "./screen-gate";
interface Loaded {
  token: object;
  value: RecurringEntryContext | null;
  verify: boolean;
  failed: boolean;
}
export function useRecurringContext(
  props: MoneyScreenAccount & { ruleId: string; editing: boolean },
  active: boolean,
  online: boolean,
) {
  const [initial, setInitial] = useState<RecurringEntryContext | null>(null);
  const [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const token = useMemo(
    () => ({
      account: props.account,
      client: props.client,
      active,
      online,
      revision,
      source: props.ruleId,
      editing: props.editing,
    }),
    [props.account, props.client, active, online, revision, props.ruleId, props.editing],
  );
  useEffect(() => {
    if (!active || !online) return;
    const controller = new AbortController();
    void Effect.runPromise(
      recurringEntryContext(props.account, props.client, {
        ruleId: props.ruleId,
        editing: props.editing,
      }),
      {
        signal: controller.signal,
      },
    ).then(
      (value) => {
        if (!controller.signal.aborted) {
          setLoaded({ token, value, verify: false, failed: false });
          setInitial((prior) => prior ?? value);
        }
      },
      (error) => {
        if (!controller.signal.aborted)
          setLoaded({ token, value: null, verify: denied(error), failed: true });
      },
    );
    return () => controller.abort();
  }, [props.account, props.client, active, online, token, props.ruleId, props.editing]);
  return {
    initial,
    ...balanceView(loaded, token, active && online),
    reload: () => setRevision((value) => value + 1),
    reset: () => {
      setInitial(null);
      setLoaded(null);
      setRevision((value) => value + 1);
    },
  };
}
function balanceView(loaded: Loaded | null, token: object, available: boolean) {
  const current = available && loaded?.token === token ? loaded : null;
  return {
    value: current?.value ?? null,
    failed: current?.failed ?? false,
    verify: loaded?.verify ?? false,
  };
}

function denied(error: unknown) {
  if (Schema.is(OfflineFailure)(error)) return error.reason === "session_changed";
  return Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code);
}

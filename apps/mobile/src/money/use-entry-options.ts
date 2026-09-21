import { useEffect, useState } from "react";
import * as Effect from "effect/Effect";
import * as Schema from "effect/Schema";
import { OfflineFailure } from "../offline/contracts";
import { PreferenceFailure } from "../preferences/client";
import { expenseEntryOptions, type ExpenseEntryOptions } from "./entry-options";
import type { MoneyScreenAccount } from "./screen-gate";
interface Loaded {
  after: string | null;
  revision: number;
  value: ExpenseEntryOptions | null;
  verify: boolean;
  failed: boolean;
}
export function useEntryOptions(props: MoneyScreenAccount, active: boolean, online: boolean) {
  const [after, setAfter] = useState<string | null>(null),
    [revision, setRevision] = useState(0);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  useEffect(() => {
    if (!active || !online) return;
    const controller = new AbortController();
    void Effect.runPromise(expenseEntryOptions(props.account, props.client, after), {
      signal: controller.signal,
    }).then(
      (value) => {
        if (!controller.signal.aborted)
          setLoaded({ after, revision, value, verify: false, failed: false });
      },
      (error) => {
        if (!controller.signal.aborted)
          setLoaded({ after, revision, value: null, verify: denied(error), failed: true });
      },
    );
    return () => controller.abort();
  }, [props.account, props.client, active, online, after, revision]);
  const view = optionsView(loaded, active, online, { after, revision });
  return {
    ...view,
    first: () => setAfter(null),
    next: () => setAfter(view.value?.categories.next ?? null),
    reload: () => setRevision((value) => value + 1),
  };
}
function optionsView(
  loaded: Loaded | null,
  active: boolean,
  online: boolean,
  target: { after: string | null; revision: number },
) {
  const matching =
    loaded !== null && loaded.after === target.after && loaded.revision === target.revision;
  const current = active && online && matching ? loaded : null;
  return optionsContent(loaded, active, current);
}
function optionsContent(loaded: Loaded | null, active: boolean, current: Loaded | null) {
  return {
    value: active ? (loaded?.value ?? null) : null,
    fresh: Boolean(current?.value),
    failed: current?.failed ?? false,
    verify: loaded?.verify ?? false,
  };
}
function denied(error: unknown) {
  if (Schema.is(OfflineFailure)(error)) return error.reason === "session_changed";
  return Schema.is(PreferenceFailure)(error) && ["session", "forbidden"].includes(error.code);
}

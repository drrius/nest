import { useState, useSyncExternalStore } from "react";
import type { MoneyScreenAccount } from "./screen-gate";
import { recurringReadOwner } from "./recurring-read-owner";
import { recurringReadOperations } from "./recurring-read-operations";
export function useDueBills({ account, client }: MoneyScreenAccount) {
  const [owner] = useState(() =>
    recurringReadOwner(recurringReadOperations(account, client), {
      kind: "due-variable",
      after: null,
    }),
  );
  return useSyncExternalStore(owner.subscribe, owner.getSnapshot);
}

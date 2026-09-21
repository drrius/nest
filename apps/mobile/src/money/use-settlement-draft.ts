import { useNativeState } from "@expo/ui";
import { useState } from "react";
import { Alert } from "react-native";
import * as Crypto from "expo-crypto";
import type { MoneyBalance } from "@nest/contracts/money";
import type { SettlementSaveRuntime } from "./settlement-save-runtime";
import {
  initialSettlementDraft,
  parseSettlementDraft,
  type SettlementDraft,
} from "./settlement-draft";
import { useLeaveSettlement } from "./use-leave-settlement";
import { formatChf } from "./format";
function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function useSettlementDraft(
  balance: typeof MoneyBalance.Type | null,
  runtime: SettlementSaveRuntime,
  reload: () => void,
) {
  const [initial] = useState(() => initialSettlementDraft(localDate(new Date())));
  const [operationId, setOperationId] = useState(Crypto.randomUUID);
  const description = useNativeState(initial.description),
    amount = useNativeState(initial.amount),
    note = useNativeState(initial.note);
  const [mode, setMode] = useState<SettlementDraft["mode"]>("full");
  const [date, setDate] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const read = (): SettlementDraft => ({
    description: description.value,
    amount: amount.value,
    note: note.value,
    mode,
    date: localDate(date),
  });
  useLeaveSettlement(initial, read, runtime);
  const submit = () => {
    if (!balance) return setError("Load the current balance before reviewing this settlement.");
    const parsed = parseSettlementDraft(read(), balance);
    if (!parsed.ok) return setError(parsed.message);
    setError(null);
    const settlement = parsed.settlement;
    const name = (id: string) =>
      balance.members.find((member) => member.actorId.toLowerCase() === id)?.displayName ??
      "Household member";
    Alert.alert(
      "Record this settlement?",
      `${settlement.description}\n${name(settlement.payerId)} → ${name(settlement.recipientId)}\n${formatChf(settlement.amountCentimes)} · ${settlement.date}\n${settlement.mode === "full" ? "Full" : "Partial"} settlement of ${formatChf(settlement.expectedOutstandingCentimes)} outstanding\n${settlement.note ?? ""}\n\nRecord only a payment already made outside Nest. Nest does not transfer money. A changed balance requires a new review.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Record settlement",
          onPress: () => void runtime.save({ operationId, settlement }),
        },
      ],
    );
  };
  const nextSettlement = () => {
    setOperationId(Crypto.randomUUID());
    setError(null);
    reload();
    runtime.acknowledge();
  };
  return { nextSettlement, description, amount, note, mode, setMode, date, setDate, error, submit };
}
export type NativeSettlementDraft = ReturnType<typeof useSettlementDraft>;

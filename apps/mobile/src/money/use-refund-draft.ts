import { useNativeState } from "@expo/ui";
import { useState } from "react";
import { Alert } from "react-native";
import * as Crypto from "expo-crypto";
import type { RefundContext } from "@nest/contracts/refund";
import type { RefundSaveRuntime } from "./refund-save-runtime";
import { initialRefundDraft, parseRefundDraft, type RefundDraft } from "./refund-draft";
import { useLeaveRefund } from "./use-leave-refund";
import { formatChf } from "./format";
function localDate(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function useRefundDraft(
  balance: typeof RefundContext.Type | null,
  runtime: RefundSaveRuntime,
  reload: () => void,
  actor: string,
) {
  const [initial] = useState(() => initialRefundDraft(localDate(new Date())));
  const [operationId, setOperationId] = useState(Crypto.randomUUID);
  const description = useNativeState(initial.description),
    own = useNativeState(initial.own),
    partner = useNativeState(initial.partner),
    note = useNativeState(initial.note);
  const [mode, setMode] = useState<RefundDraft["mode"]>("full");
  const [date, setDate] = useState(() => new Date());
  const [error, setError] = useState<string | null>(null);
  const read = (): RefundDraft => ({
    description: description.value,
    own: own.value,
    partner: partner.value,
    note: note.value,
    mode,
    date: localDate(date),
  });
  useLeaveRefund(initial, read, runtime);
  const submit = () => {
    if (!balance) return setError("Load current refundable shares before reviewing this refund.");
    const parsed = parseRefundDraft(read(), balance, actor);
    if (!parsed.ok) return setError(parsed.message);
    setError(null);
    const refund = parsed.refund;
    const name = (id: string) => (id === actor ? "You" : "Your partner");
    Alert.alert(
      "Record this refund?",
      `${refund.description}\nFor: ${balance.source.event.description}\nOriginal payer: ${name(refund.payerId)}\n${formatChf(refund.amountCentimes)} · ${refund.date}\n${refund.allocations.map((share) => `${name(share.memberId)}: ${formatChf(share.centimes)}`).join("\n")}\n${refund.note ?? ""}\n\nRecord only a refund already received outside Nest. The original entry remains in history. Changed remaining shares require a new review.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Record refund",
          onPress: () => void runtime.save({ operationId, refund }),
        },
      ],
    );
  };
  const nextRefund = () => {
    setOperationId(Crypto.randomUUID());
    setError(null);
    reload();
    runtime.acknowledge();
  };
  return {
    nextRefund,
    description,
    own,
    partner,
    note,
    mode,
    setMode,
    date,
    setDate,
    error,
    submit,
  };
}
export type NativeRefundDraft = ReturnType<typeof useRefundDraft>;

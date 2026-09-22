import { Alert } from "react-native";
import * as Crypto from "expo-crypto";
import type { Renewal } from "@nest/contracts/renewals";
import type { RenewalSaveRuntime } from "./save-runtime";
export function confirmRenewalRemoval(
  renewal: typeof Renewal.Type,
  current: () => boolean,
  runtime: RenewalSaveRuntime,
) {
  if (!current() || renewal.removed) return;
  const command = {
    operationId: Crypto.randomUUID(),
    renewalId: renewal.renewalId,
    expectedRevision: renewal.revision,
  };
  let used = false;
  Alert.alert(
    "Remove this renewal?",
    `${renewal.fields.title}\nThis removes the renewal from the active list. It does not cancel the contract or change financial history.`,
    [
      { text: "Keep renewal", style: "cancel" },
      {
        text: "Remove renewal",
        style: "destructive",
        onPress: () => {
          if (used || !current()) return;
          used = true;
          void runtime.save(command);
        },
      },
    ],
  );
}

import { useLeaveGrocery } from "../groceries/use-draft";
import { scheduleOnRN } from "react-native-worklets";
import { Host, TextInput, useNativeState, type TextInputRef } from "@expo/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "expo-router";
import { useColorScheme } from "react-native";
import * as Crypto from "expo-crypto";
import type { GroceryClient } from "../groceries/client";
import { useGroceryEditor } from "../groceries/use-editor";
import { useOfflineAccount } from "../offline/provider";
import type { OfflineAccount } from "../offline/owner";
import { useQuiet } from "../theme";
import { Card, Note } from "./page";
import { NativeAction } from "./native-action";
export function GroceryQuickAdd({
  client,
  refresh,
}: {
  client: GroceryClient;
  refresh: () => void;
}) {
  const { state } = useOfflineAccount();
  if (state.status !== "ready") return null;
  return <QuickAdd account={state.account} client={client} refresh={refresh} />;
}
function QuickAdd({
  account,
  client,
  refresh,
}: {
  account: OfflineAccount;
  client: GroceryClient;
  refresh: () => void;
}) {
  const { view, save } = useGroceryEditor(account, client);
  const name = useNativeState("");
  const input = useRef<TextInputRef>(null);
  const [error, setError] = useState<string | null>(null);
  const draft = useRef<{ name: string; operationId: string; itemId: string } | null>(null);
  const markEdited = useCallback(() => {
    draft.current = null;
  }, []);
  const changed = useCallback(() => {
    "worklet";
    scheduleOnRN(markEdited);
  }, [markEdited]);
  const colors = useQuiet(),
    scheme = useColorScheme();
  useEffect(() => {
    if (!view.savedOperation) return;
    if (view.savedOperation === draft.current?.operationId) input.current?.clear();
    refresh();
  }, [view.savedOperation, refresh]);
  useLeaveGrocery(() => !view.pending && name.value.trim().length > 0);
  const submit = () => {
    const trimmed = name.value.trim();
    if (!trimmed || trimmed.length > 120) return setError("Add a name up to 120 characters.");
    if (draft.current?.name !== trimmed)
      draft.current = {
        name: trimmed,
        operationId: Crypto.randomUUID(),
        itemId: Crypto.randomUUID(),
      };
    setError(null);
    save({
      action: "add",
      command: { ...draft.current, quantity: null, unit: null, categoryId: null },
    });
  };
  return (
    <Card>
      {view.pending ? (
        <Note>Your previous grocery save needs confirmation. Open it to review or retry.</Note>
      ) : (
        <>
          <Host
            matchContents
            colorScheme={scheme === "dark" ? "dark" : "light"}
            seedColor={colors.accent}
          >
            <TextInput
              ref={input}
              onChangeText={changed}
              value={name}
              placeholder="Add a grocery"
              maxLength={120}
              editable={view.loaded && !view.working}
              returnKeyType="done"
            />
          </Host>
          <NativeAction
            label={view.working ? "Working…" : "Add online"}
            disabled={!view.loaded || view.working}
            onPress={submit}
          />
        </>
      )}
      {error ? <Note>{error}</Note> : null}
      {view.error ? <Note>{view.error}</Note> : null}
      <Link href="/grocery-edit" style={{ color: colors.accent, fontSize: 17, paddingVertical: 8 }}>
        {view.pending ? "Review previous save" : "Add with quantity or category"}
      </Link>
    </Card>
  );
}

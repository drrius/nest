import { useEffect, useState } from "react";
import { ActivityIndicator } from "react-native";
import { Link, useLocalSearchParams } from "expo-router";
import * as Effect from "effect/Effect";
import type { Grocery } from "@nest/contracts/groceries";
import type { OfflineAccount } from "../offline/owner";
import { useOfflineAccount } from "../offline/provider";
import { useSession } from "../session/provider";
import { useGroceryEditor } from "../groceries/use-editor";
import type { GroceryClient } from "../groceries/client";
import { GroceryFields } from "../components/grocery-fields";
import { GroceryRetry } from "../components/grocery-retry";
import { NativeAction } from "../components/native-action";
import { Page, Note } from "../components/page";
import { SignInCard } from "../components/sign-in-card";
import { useQuiet } from "../theme";
export default function GroceryEditorScreen() {
  const session = useSession(),
    offline = useOfflineAccount();
  const { itemId } = useLocalSearchParams<{ itemId?: string }>();
  if (session.state.status !== "ready" || !session.groceries)
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  if (offline.state.status !== "ready")
    return (
      <Page>
        <Note>
          {offline.state.status === "error"
            ? "Could not open saved groceries."
            : "Opening saved groceries…"}
        </Note>
        <NativeAction label="Try again" onPress={offline.retry} />
      </Page>
    );
  const account = offline.state.account;
  return (
    <Editor
      key={`${account.session.actor}:${account.session.household}:${itemId ?? "add"}`}
      account={account}
      client={session.groceries}
      itemId={itemId}
    />
  );
}
function Editor({
  account,
  client,
  itemId,
}: {
  account: OfflineAccount;
  client: GroceryClient;
  itemId?: string;
}) {
  const { view, save, retry, discard, reload } = useGroceryEditor(account, client);
  const selected = useSelectedGrocery(account, itemId);
  const colors = useQuiet();
  return (
    <Page>
      {view.working ? <ActivityIndicator accessibilityLabel="Saving or loading groceries" /> : null}
      {view.error ? <Note>{view.error}</Note> : null}
      {view.categoryError ? <Note>{view.categoryError}</Note> : null}
      <EditorBody
        view={view}
        selected={selected}
        save={save}
        retry={retry}
        discard={discard}
        reload={reload}
      />
      <Link
        dismissTo
        href="/checklist"
        style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}
      >
        Back to checklist
      </Link>
    </Page>
  );
}
function EditorBody({
  view,
  selected,
  save,
  retry,
  discard,
  reload,
}: ReturnType<typeof useGroceryEditor> & { selected: ReturnType<typeof useSelectedGrocery> }) {
  if (!view.loaded)
    return <NativeAction label="Load saved attempt" onPress={reload} disabled={view.working} />;
  if (view.pending)
    return (
      <GroceryRetry change={view.pending} retry={retry} discard={discard} working={view.working} />
    );
  if (view.saved)
    return <Note>Saved online. Return to the checklist to see the latest shared items.</Note>;
  if (selected.status !== "ready")
    return (
      <Note>
        {selected.status === "loading"
          ? "Loading grocery…"
          : "This grocery is unavailable or has saved checks. Return to the checklist and sync before editing."}
      </Note>
    );
  return (
    <GroceryFields
      item={selected.item}
      categories={view.categories}
      working={view.working}
      save={save}
    />
  );
}
function useSelectedGrocery(account: OfflineAccount, itemId?: string) {
  const [selected, setSelected] = useState<
    { status: "loading" | "missing" } | { status: "ready"; item: Grocery | null }
  >({ status: "loading" });
  useEffect(() => {
    let active = true;
    if (!itemId) return;
    void Effect.runPromise(account.store.readGroceries(account.session))
      .then((data) => {
        const item = data.groceries.find((row) => row.itemId === itemId);
        if (active)
          setSelected(item && !item.pending ? { status: "ready", item } : { status: "missing" });
      })
      .catch(() => {
        if (active) setSelected({ status: "missing" });
      });
    return () => {
      active = false;
    };
  }, [account, itemId]);
  return itemId ? selected : { status: "ready" as const, item: null };
}

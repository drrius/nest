import { useSyncExternalStore } from "react";
import { FlatList } from "react-native";
import { MoneyScreenGate, type MoneyScreenAccount } from "../money/screen-gate";
import { useDueBills } from "../money/use-due-bills";
import { useSaveActivity } from "../money/use-save-activity";
import { DueBillRow, DueBillStatus } from "../money/due-bill-content";
import type { RecurringReadRuntime } from "../money/recurring-read-runtime";
import { Note, Page } from "../components/page";
import { NativeAction } from "../components/native-action";
import { space, useQuiet } from "../theme";
export default function DueBillsScreen() {
  return (
    <MoneyScreenGate>
      {(props) => <Owner key={props.account.session.lease} {...props} />}
    </MoneyScreenGate>
  );
}
function Owner(props: MoneyScreenAccount) {
  const runtime = useDueBills(props);
  return runtime ? (
    <Bills runtime={runtime} verify={props.verify} />
  ) : (
    <Page>
      <Note>Loading due bills…</Note>
    </Page>
  );
}
function Bills({ runtime, verify }: { runtime: RecurringReadRuntime; verify: () => void }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const colors = useQuiet();
  useSaveActivity(runtime);
  const page = view.entry?.kind === "due-variable" ? view.entry.value : null;
  return (
    <FlatList
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      data={page?.rules ?? []}
      keyExtractor={(rule) => rule.ruleId}
      renderItem={({ item }) => <DueBillRow rule={item} />}
      ListHeaderComponent={<DueBillStatus view={view} runtime={runtime} verify={verify} />}
      ListEmptyComponent={
        page ? (
          <Note>
            {page.after
              ? "No more due bills on this page."
              : "No variable bills awaiting confirmation."}
          </Note>
        ) : null
      }
      ListFooterComponent={<Navigation runtime={runtime} />}
    />
  );
}

function Navigation({ runtime }: { runtime: RecurringReadRuntime }) {
  const view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  const page = view.entry?.kind === "due-variable" ? view.entry.value : null;
  return (
    <>
      {page?.next ? (
        <NativeAction
          label="Next due bills"
          onPress={() => {
            void runtime.select({ kind: "due-variable", after: page.next });
          }}
        />
      ) : null}
      {view.target.kind === "due-variable" && view.target.after ? (
        <NativeAction
          label="Back to first bills"
          disabled={view.busy}
          onPress={() => {
            void runtime.select({ kind: "due-variable", after: null });
          }}
        />
      ) : null}
    </>
  );
}

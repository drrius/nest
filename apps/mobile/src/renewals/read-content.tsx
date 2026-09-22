import { FlatList, View } from "react-native";
import { useRouter } from "expo-router";
import type { Renewal } from "@nest/contracts/renewals";
import { Card, Note, Page, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { space, useQuiet } from "../theme";
import type { RenewalReadRuntime, RenewalReadView } from "./read-runtime";
type Props = { runtime: RenewalReadRuntime; view: RenewalReadView };
function Status({ runtime, view }: Props) {
  return (
    <View style={{ gap: space.small }}>
      {!view.active ? <Note>Renewals are hidden while this screen is inactive.</Note> : null}
      {view.active && !view.online ? <Note>Connect to view current renewals.</Note> : null}
      {view.busy ? <Note>Loading renewals…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <NativeAction
        label="Reload renewals"
        disabled={!view.active || !view.online || view.busy}
        onPress={() => void runtime.refresh()}
      />
    </View>
  );
}
function Summary({ renewal }: { renewal: typeof Renewal.Type }) {
  return (
    <Section title={renewal.fields.title}>
      {renewal.removed ? <Note>Removed from active renewals</Note> : null}
      <Note>Renews: {renewal.fields.renewalOn}</Note>
      <Note>Cancellation deadline: {renewal.cancellationOn}</Note>
      <Note>Notice: {renewal.fields.noticeDays} days before renewal</Note>
    </Section>
  );
}
function Row({ renewal }: { renewal: typeof Renewal.Type }) {
  const router = useRouter();
  return (
    <Card>
      <Summary renewal={renewal} />
      <NativeAction
        label={`View ${renewal.fields.title}`}
        onPress={() =>
          router.push({ pathname: "/renewal", params: { renewalId: renewal.renewalId } })
        }
      />
    </Card>
  );
}
function Detail({ renewal }: { renewal: typeof Renewal.Type }) {
  const router = useRouter();
  return (
    <>
      <Summary renewal={renewal} />
      <Note>
        These dates are reminders. Changing a renewal does not cancel a contract or change financial
        history.
      </Note>
      {renewal.fields.recurringRuleId ? (
        <NativeAction
          label="View linked recurring expense"
          onPress={() =>
            router.push({
              pathname: "/recurring-rule",
              params: { ruleId: renewal.fields.recurringRuleId! },
            })
          }
        />
      ) : (
        <Note>No recurring expense linked.</Note>
      )}
    </>
  );
}
export function RenewalReadContent({ runtime, view }: Props) {
  const colors = useQuiet(),
    entry = view.entry;
  if (entry?.kind !== "list")
    return (
      <Page>
        <Status runtime={runtime} view={view} />
        {entry?.kind === "detail" ? <Detail renewal={entry.data.renewal} /> : null}
      </Page>
    );
  const page = entry.data;
  return (
    <FlatList
      data={page.renewals}
      keyExtractor={(item) => item.renewalId}
      renderItem={({ item }) => <Row renewal={item} />}
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.medium, paddingBottom: 48 }}
      ListHeaderComponent={<Status runtime={runtime} view={view} />}
      ListEmptyComponent={<Note>{page.after ? "No more renewals." : "No renewals yet."}</Note>}
      ListFooterComponent={
        <View style={{ gap: space.small }}>
          {page.next ? (
            <NativeAction
              label="Next renewals"
              onPress={() => void runtime.select({ kind: "list", after: page.next })}
            />
          ) : null}
          {page.after ? (
            <NativeAction
              label="Back to first renewals"
              onPress={() => void runtime.select({ kind: "list", after: null })}
            />
          ) : null}
        </View>
      }
    />
  );
}

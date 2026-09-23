import { Host, Switch } from "@expo/ui";
import { Text, useColorScheme } from "react-native";
import { router } from "expo-router";
import type { Renewal } from "@nest/contracts/renewals";
import { Card, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useQuiet } from "../theme";
import type { CalendarRenewalRuntime, CalendarRenewalView } from "./renewal-runtime";
export function CalendarRenewalControls({
  runtime,
  view,
  verify,
}: {
  runtime: CalendarRenewalRuntime;
  view: CalendarRenewalView;
  verify: () => void;
}) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  return (
    <Card>
      <Host
        matchContents
        colorScheme={scheme === "dark" ? "dark" : "light"}
        seedColor={colors.accent}
      >
        <Switch
          label="Show renewals"
          value={view.enabled}
          onValueChange={(value) => {
            void runtime.setEnabled(value);
          }}
        />
      </Host>
      {view.enabled ? (
        <>
          <Note>
            App-only dates. These do not book calendar time, make payments or cancel subscriptions.
          </Note>
          {view.busy ? <Note>Refreshing renewals…</Note> : null}
          {view.notice ? <Note>{view.notice}</Note> : null}
          {view.rows?.length === 0 ? (
            <Note>No renewals or cancellation deadlines for this day.</Note>
          ) : null}
          <NativeAction
            label={view.access ? "Refresh renewals" : "Verify account"}
            disabled={view.busy}
            onPress={() => {
              if (view.access) void runtime.refresh();
              else verify();
            }}
          />
        </>
      ) : null}
    </Card>
  );
}
export function CalendarRenewalRow({ row, date }: { row: typeof Renewal.Type; date: string }) {
  const colors = useQuiet();
  return (
    <Card>
      <Text selectable style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>
        {row.fields.title}
      </Text>
      <Note>
        {row.fields.renewalOn === date ? "Renewal date" : "Cancellation deadline"} · {date}
      </Note>
      {row.fields.renewalOn === date && row.cancellationOn === date ? (
        <Note>Cancellation deadline is also today.</Note>
      ) : null}
      <NativeAction
        label="View renewal"
        onPress={() => router.push({ pathname: "/renewal", params: { renewalId: row.renewalId } })}
      />
    </Card>
  );
}

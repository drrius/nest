import { Host, Switch } from "@expo/ui";
import { Text, useColorScheme } from "react-native";
import { router } from "expo-router";
import type { CalendarChore } from "@nest/contracts/calendar-chores";
import { Card, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useQuiet } from "../theme";
import type { CalendarChoreRuntime, CalendarChoreView } from "./chore-runtime";
export function CalendarChoreControls({
  runtime,
  view,
  verify,
}: {
  runtime: CalendarChoreRuntime;
  view: CalendarChoreView;
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
          label="Show chores"
          value={view.enabled}
          onValueChange={(value) => {
            void runtime.setEnabled(value);
          }}
        />
      </Host>
      {view.enabled ? (
        <>
          <Note>
            Household layer only. Chores have due dates, not booked times. Next-occurrence previews
            may change; later repeats are not shown.
          </Note>
          {view.busy ? <Note>Refreshing chores…</Note> : null}
          {view.notice ? <Note>{view.notice}</Note> : null}
          {view.rows?.length === 0 ? <Note>No stored chore occurrences for this day.</Note> : null}
          <NativeAction
            label={view.access ? "Refresh chores" : "Verify account"}
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
export function CalendarChoreRow({
  row,
  actor,
}: {
  row: typeof CalendarChore.Type;
  actor: string;
}) {
  const colors = useQuiet();
  const assignee =
    row.assigneeId === null ? "Shared" : row.assigneeId === actor ? "You" : "Partner";
  return (
    <Card>
      <Text selectable style={{ color: colors.text, fontSize: 20, fontWeight: "600" }}>
        {row.title}
      </Text>
      <Note>
        {assignee} · Due {row.dueDate} · No set time
      </Note>
      <Note>
        {row.role === "preview"
          ? "Tentative next occurrence · not yet actionable"
          : "Current chore occurrence"}
      </Note>
      <NativeAction label="Manage chores" onPress={() => router.push("/routines")} />
    </Card>
  );
}

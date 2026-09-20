import type { Routine } from "@nest/contracts/routines";
import { Host, Column, Text, TextInput, Picker } from "@expo/ui";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { useColorScheme } from "react-native";
import { householdDate } from "@nest/domain/calendar";
import { useQuiet } from "../theme";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { RoutineRuntime, RoutineView } from "./runtime";
import { useRoutineDraft } from "./use-draft";
import { ScheduleFields } from "./schedule-fields";
type Draft = ReturnType<typeof useRoutineDraft>;
function Responsibility({
  draft,
  view,
  enabled,
}: {
  draft: Draft;
  view: RoutineView;
  enabled: boolean;
}) {
  return (
    <Column spacing={12}>
      <Text>Responsibility</Text>
      <Picker selectedValue={draft.policy} onValueChange={draft.setPolicy} enabled={enabled}>
        <Picker.Item value="shared" label="Shared" />
        <Picker.Item value="assigned" label="Assigned" />
        <Picker.Item value="alternating" label="Alternating turns" />
      </Picker>
      {draft.policy !== "shared" ? (
        <Column spacing={8}>
          <Text>{draft.policy === "alternating" ? "First turn" : "Responsible person"}</Text>
          <Picker selectedValue={draft.member} onValueChange={draft.setMember} enabled={enabled}>
            {view.snapshot?.members.map((member) => (
              <Picker.Item key={member.actorId} value={member.actorId} label={member.displayName} />
            ))}
          </Picker>
        </Column>
      ) : null}
    </Column>
  );
}
function Interval({ draft, enabled }: { draft: Draft; enabled: boolean }) {
  return (
    <Column spacing={12}>
      <Text>Interval after completion</Text>
      <TextInput
        value={draft.every}
        placeholder="Whole number"
        keyboardType="number-pad"
        maxLength={10}
        editable={enabled}
      />
      <Picker
        selectedValue={draft.schedule.unit}
        onValueChange={(unit) => draft.setSchedule({ ...draft.schedule, unit })}
        enabled={enabled}
      >
        <Picker.Item value="days" label="Days" />
        <Picker.Item value="weeks" label="Weeks" />
      </Picker>
    </Column>
  );
}
export function RoutineForm({
  runtime,
  view,
  routine,
}: {
  runtime: RoutineRuntime;
  view: RoutineView;
  routine?: Routine;
}) {
  const draft = useRoutineDraft(runtime, view, routine);
  const enabled =
    !view.busy &&
    view.stage === "ready" &&
    (routine !== undefined || view.snapshot?.members.length === 2);
  return (
    <Card>
      <Section title={routine ? "Edit routine" : "Create routine"} />
      <Note>
        {routine
          ? "Only changed fields are saved. Saving needs a connection. Reloading discards this draft and shows the current routines."
          : "Shared by default. Creating a routine needs a connection. Your draft and retry details stay here while this form is open."}
      </Note>
      <RoutineFields draft={draft} view={view} enabled={enabled} editing={!!routine} />
      {draft.error ? <Note>{draft.error}</Note> : null}
      <NativeAction
        label={view.busy ? "Working…" : routine ? "Save changes online" : "Create online"}
        disabled={!enabled}
        onPress={draft.submit}
      />
    </Card>
  );
}

function RoutineFields({
  draft,
  view,
  enabled,
  editing,
}: {
  draft: Draft;
  view: RoutineView;
  enabled: boolean;
  editing: boolean;
}) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  return (
    <>
      <Host
        matchContents
        colorScheme={scheme === "dark" ? "dark" : "light"}
        seedColor={colors.accent}
      >
        <Column spacing={12}>
          <Text>Title</Text>
          <TextInput
            value={draft.title}
            placeholder="What needs doing?"
            maxLength={editing ? 240 : 120}
            editable={enabled}
          />
          <ScheduleFields value={draft.schedule} change={draft.setSchedule} enabled={enabled} />
          {draft.schedule.kind === "after_completion" ? (
            <Interval draft={draft} enabled={enabled} />
          ) : null}
          <Responsibility draft={draft} view={view} enabled={enabled} />
        </Column>
      </Host>
      {draft.schedule.kind === "one_off" ? (
        <>
          <Note>Due date · Europe/Zurich</Note>
          <DateTimePicker
            mode="date"
            value={new Date(`${draft.schedule.date}T12:00:00Z`)}
            timeZoneName="Europe/Zurich"
            disabled={!enabled}
            onChange={(_, date) => {
              if (date) draft.setSchedule({ ...draft.schedule, date: householdDate(date) });
            }}
          />
        </>
      ) : null}
      {draft.schedule.kind === "monthly" ? <Note>Shorter months use their last day.</Note> : null}
    </>
  );
}

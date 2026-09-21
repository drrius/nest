import { Host, Column, Text, TextInput, Picker } from "@expo/ui";
import DateTimePicker from "@expo/ui/community/datetime-picker";
import { useColorScheme } from "react-native";
import { householdDate } from "@nest/domain/calendar";
import { useQuiet } from "../theme";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { usePreparationDraft } from "./use-preparation-draft";
import type { MealPreparationRuntime, PreparationView } from "./preparation-runtime";
export function PreparationForm({
  runtime,
  view,
}: {
  runtime: MealPreparationRuntime;
  view: PreparationView;
}) {
  const draft = usePreparationDraft(runtime, view);
  const enabled = !view.busy && view.stage === "ready" && view.members.length === 2;
  return (
    <Card>
      <Section title="Add preparation" />
      <Note>
        Create one household task linked to this meal. Saving needs a connection. Your draft stays
        here during retries and reloads.
      </Note>
      <PreparationFields draft={draft} view={view} enabled={enabled} />
      <Note>Due date · Europe/Zurich</Note>
      <DateTimePicker
        mode="date"
        value={new Date(`${draft.dueOn}T12:00:00Z`)}
        timeZoneName="Europe/Zurich"
        disabled={!enabled}
        onChange={(_, date) => {
          if (date) draft.setDueOn(householdDate(date));
        }}
      />
      {draft.error ? <Note>{draft.error}</Note> : null}
      <NativeAction label="Create preparation online" disabled={!enabled} onPress={draft.submit} />
    </Card>
  );
}
function PreparationFields({
  draft,
  view,
  enabled,
}: {
  draft: ReturnType<typeof usePreparationDraft>;
  view: PreparationView;
  enabled: boolean;
}) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  return (
    <Host
      matchContents
      colorScheme={scheme === "dark" ? "dark" : "light"}
      seedColor={colors.accent}
    >
      <Column spacing={12}>
        <Text>Task title</Text>
        <TextInput
          value={draft.title}
          placeholder="What needs preparing?"
          maxLength={120}
          editable={enabled}
        />
        <Text>Instructions · optional</Text>
        <TextInput
          value={draft.instructions}
          placeholder="How to prepare it"
          multiline
          maxLength={4000}
          editable={enabled}
        />
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
              {view.members.map((member) => (
                <Picker.Item
                  key={member.actorId}
                  value={member.actorId}
                  label={member.displayName}
                />
              ))}
            </Picker>
          </Column>
        ) : null}
      </Column>
    </Host>
  );
}

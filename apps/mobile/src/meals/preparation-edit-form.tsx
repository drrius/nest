import DateTimePicker from "@expo/ui/community/datetime-picker";
import { householdDate } from "@nest/domain/calendar";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { PreparationFields } from "./preparation-form";
import { usePreparationEditDraft } from "./use-preparation-edit-draft";
import type { MealPreparationEditRuntime, PreparationEditView } from "./preparation-edit-runtime";
export function PreparationEditForm({
  runtime,
  view,
}: {
  runtime: MealPreparationEditRuntime;
  view: PreparationEditView;
}) {
  const draft = usePreparationEditDraft(runtime, view);
  const task = view.snapshot!.preparation!;
  const locked = draft.checking || view.busy;
  const enabled = !locked && view.stage === "ready" && task.state !== "archived";
  const scheduling = enabled && task.status === "open";
  return (
    <Card>
      <Section title="Edit preparation" />
      <Note>
        Only changed fields are saved. Saving needs a connection. Reloading replaces this draft with
        the current household task.
      </Note>
      {task.status !== "open" ? (
        <Note>
          Finished preparation keeps its date and responsibility. You can correct its title and
          instructions.
        </Note>
      ) : null}
      {task.state === "archived" ? <Note>This task is archived and cannot be edited.</Note> : null}
      <PreparationFields
        draft={draft}
        view={view}
        enabled={enabled}
        assignmentEnabled={scheduling}
        titleLimit={240}
        instructionsLimit={8000}
      />
      <Note>
        Due date · Europe/Zurich. Your selected calendars are checked when saving a new date. Busy
        or unknown availability never prevents saving.
      </Note>
      <DateTimePicker
        mode="date"
        value={new Date(`${draft.dueOn}T12:00:00Z`)}
        timeZoneName="Europe/Zurich"
        disabled={!scheduling}
        onChange={(_, date) => {
          if (date) draft.setDueOn(householdDate(date));
        }}
      />
      {draft.error ? <Note>{draft.error}</Note> : null}
      <NativeAction
        label={draft.checking ? "Checking calendar…" : "Save preparation changes online"}
        disabled={!enabled}
        onPress={draft.submit}
      />
      <NativeAction
        label="Reload current preparation"
        disabled={locked || view.pendingWrite}
        onPress={draft.reload}
      />
    </Card>
  );
}

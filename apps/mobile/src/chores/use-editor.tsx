import { useState } from "react";
import type { useChores } from "./use-chores";
import type { ChoreChoice } from "./menu-types";
import { ChoreChangeForm } from "./change-form";
import { useChoreChangeNavigation } from "./use-change-navigation";

export function useChoreEditor(controller: ReturnType<typeof useChores>) {
  const [draft, setDraft] = useState<{ choice: ChoreChoice; revision: number } | null>(null);
  const { view } = controller;
  const choice = draft?.revision === view.changed ? draft.choice : null;
  useChoreChangeNavigation(choice !== null, view.pendingWrite);
  return {
    choose: (choice: ChoreChoice) => setDraft({ choice, revision: view.changed }),
    editing: choice?.chore.occurrenceId ?? null,
    editor: choice ? (
      <ChoreChangeForm
        key={`${choice.chore.occurrenceId}:${choice.action}`}
        choice={choice}
        disabled={view.changeStage !== "ready"}
        dismiss={() => setDraft(null)}
        submit={(date) => {
          if (choice.action === "skip") void controller.skip(choice.chore);
          else if (date) void controller.reschedule(choice.chore, date);
        }}
      />
    ) : null,
  };
}

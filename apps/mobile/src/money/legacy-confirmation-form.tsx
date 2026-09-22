import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { ExpenseFields } from "./expense-fields";
import { legacyDraftText } from "./legacy-dismissal-confirmation";
import {
  useLegacyConfirmationDraft,
  type ConfirmationFormProps,
} from "./use-legacy-confirmation-draft";
import { legacyConfirmationContextMatches } from "./legacy-confirmation-draft";
export function LegacyConfirmationForm(
  props: ConfirmationFormProps & {
    actor: string;
    visible: boolean;
    first: () => void;
    next: () => void;
    reset: () => void;
  },
) {
  const draft = useLegacyConfirmationDraft(props);
  if (!props.visible) return <Note>Draft details are hidden while inactive.</Note>;
  const matching = props.current && legacyConfirmationContextMatches(props.initial, props.current);
  const editable = canEdit(props);
  return (
    <>
      <Section title="Original retained draft">
        <Note>{legacyDraftText(props.initial.review, props.actor)}</Note>
      </Section>
      {!matching ? (
        <Note>
          Connect and load the current draft and household. If they changed, review the latest draft
          and explicitly reset this form. Your edits remain here until then.
        </Note>
      ) : null}
      {props.current ? (
        <Note>
          Current draft status: {props.current.review.draft.status}. Only pending recurring drafts
          without a linked financial event can be confirmed.
        </Note>
      ) : null}
      <Note>
        Review the complete expense below. Missing values must be filled in; the original draft and
        recurring rule remain in history.
      </Note>
      {!draft.dateChosen ? (
        <>
          <Note>
            The original date is unsupported. Choose a date below or explicitly accept the displayed
            date.
          </Note>
          <NativeAction
            label="Use displayed expense date"
            disabled={!editable}
            onPress={draft.confirmDate}
          />
        </>
      ) : null}
      <ExpenseFields
        draft={draft}
        options={props.current?.options ?? props.initial.options}
        disabled={!editable}
        first={props.first}
        next={props.next}
        title="Expense to record"
        reviewLabel="Review and confirm expense"
      />
      <NativeAction
        label="Review latest draft and reset form"
        disabled={!props.current}
        onPress={props.reset}
      />
    </>
  );
}

function canEdit(props: ConfirmationFormProps) {
  const current = props.current;
  if (!current || !legacyConfirmationContextMatches(props.initial, current)) return false;
  const row = current.review.draft;
  return row.status === "pending" && row.sourceKind === "recurring" && row.eventId === null;
}

import type { AdoptionFormContext } from "./legacy-adoption-draft";
import { useRouter } from "expo-router";
import { Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { RecurringFields } from "./recurring-fields";
import { useLegacyAdoptionDraft, type AdoptionFormProps } from "./use-legacy-adoption-draft";
import { adoptionContextMatches } from "./legacy-adoption-draft";
import { adoptionBlockerText, adoptionSourceText } from "./legacy-adoption-summary";
export function LegacyAdoptionForm(
  props: AdoptionFormProps & {
    visible: boolean;
    first: () => void;
    next: () => void;
    reset: () => void;
  },
) {
  const draft = useLegacyAdoptionDraft(props);
  if (!props.visible) return <Note>Adoption details are hidden while inactive.</Note>;
  const matching = props.current && adoptionContextMatches(props.initial, props.current);
  const review = props.current?.review ?? props.initial.review;
  return (
    <>
      <AdoptionSource original={props.initial} review={review} actor={props.actor} />
      {!matching ? (
        <Note>
          Load the current rule and household before saving. Changed source requires an explicit
          form reset; your edits are retained.
        </Note>
      ) : null}
      <Note>
        Choose variable confirmation or explicitly authorize fixed automatic recording. Saving
        adopts this rule and stops its old generator; it records no expense.
      </Note>
      <RecurringFields
        reviewLabel="Review and adopt this rule"
        draft={draft}
        options={props.current?.options ?? props.initial.options}
        disabled={!matching || review.blockers.length > 0}
        first={props.first}
        next={props.next}
      />
      <NativeAction
        label="Review latest rule and reset form"
        disabled={!props.current}
        onPress={props.reset}
      />
    </>
  );
}

function AdoptionSource({
  original,
  review,
  actor,
}: {
  original: AdoptionFormContext;
  review: AdoptionFormContext["review"];
  actor: string;
}) {
  const router = useRouter();
  return (
    <Section title="Retained legacy rule">
      <Note>{adoptionSourceText(original, actor)}</Note>
      <Note>Original rule reference: {review.rule.ruleId}</Note>
      <Note>
        Pending: {review.rule.drafts.pending} · Posted: {review.rule.drafts.posted} · Dismissed:{" "}
        {review.rule.drafts.dismissed}
      </Note>
      <Note>
        History covered through: {review.coveredThrough ?? "No supported retained period"}. The
        first new cycle must not overlap this history.
      </Note>
      <Note>
        Old drafts have no saved cadence revision. Coverage conservatively includes both their week
        and month; switching cadence can skip an overlapping period.
      </Note>
      {review.blockers.map((blocker) => (
        <Note key={blocker}>{adoptionBlockerText[blocker]}</Note>
      ))}
      <NativeAction
        label="Review retained drafts"
        onPress={() =>
          router.push({
            pathname: "/legacy-recurring-drafts",
            params: { ruleId: review.rule.ruleId },
          })
        }
      />
      {review.adoption ? (
        <NativeAction
          label="Open adopted rule"
          onPress={() =>
            router.push({
              pathname: "/recurring-rule",
              params: { ruleId: review.adoption!.nativeRuleId },
            })
          }
        />
      ) : null}
    </Section>
  );
}

import { Alert } from "react-native";
import { Link } from "expo-router";
import { Section, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { IngredientRuntime, IngredientView } from "./ingredient-runtime";
export function IngredientControls({
  runtime,
  view,
}: {
  runtime: IngredientRuntime;
  view: IngredientView;
}) {
  const selected = view.attempt?.choices.filter((row) => row.selected).length ?? 0;
  const pending = view.attempt?.pending;
  return (
    <Section title={`Week of ${runtime.weekStart}`}>
      <Note>
        Choose what you need. Leave pantry ingredients off, and check quantities before adding. Each
        meal keeps its own ingredient rows.
      </Note>
      <IngredientStatus view={view} />
      <Note>
        {selected} selected · {view.ingredients.length} ingredients loaded
      </Note>
      <SkippedIngredients skipped={view.skipped} />
      {pending ? (
        <>
          <Note>
            {pending.selected.length} selected ingredients are saved in an unresolved request. You
            can leave and return to this week; no automatic retry will run.
          </Note>
          <NativeAction
            label="Retry saved addition"
            disabled={view.busy}
            onPress={() => {
              void runtime.retry();
            }}
          />
        </>
      ) : (
        <>
          <NativeAction
            label="Refresh ingredients"
            disabled={view.busy}
            onPress={() => {
              void runtime.load();
            }}
          />
          <NativeAction
            label={`Add ${selected} selected ingredients`}
            disabled={view.busy || !view.fresh || selected === 0}
            onPress={() => confirm(runtime, view, selected)}
          />
        </>
      )}
      <Link href="/checklist">Open groceries</Link>
    </Section>
  );
}
function confirm(runtime: IngredientRuntime, view: IngredientView, count: number) {
  const sequence = view.attempt?.sequence;
  if (sequence === undefined) return;
  Alert.alert(
    "Add selected ingredients?",
    `Add these ${count} ingredient rows to your shared grocery list using the quantities shown. Unselected pantry items stay out. Previously added sources will not be duplicated.`,
    [
      { text: "Cancel", style: "cancel" },
      {
        text: "Add ingredients",
        onPress: () => {
          void runtime.confirm(sequence);
        },
      },
    ],
  );
}
function SkippedIngredients({ skipped }: { skipped: IngredientView["skipped"] }) {
  const leftovers = skipped.filter((row) => row.reason === "leftovers").length;
  const missing = skipped.length - leftovers;
  return (
    <>
      {leftovers ? <Note>{leftovers} leftover meals do not add another purchase.</Note> : null}
      {missing ? (
        <Note>
          {missing} meals have no retained ingredient list. Check their details and add anything
          needed manually in Groceries.
        </Note>
      ) : null}
    </>
  );
}

function IngredientStatus({ view }: { view: IngredientView }) {
  const added = view.receipt?.ingredients.filter((row) => row.outcome === "added").length ?? 0;
  return (
    <>
      {view.busy ? <Note>Loading or saving… Wait until the full review is ready.</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {!view.fresh && view.ingredients.length ? (
        <Note>Previously loaded ingredients · refresh before making changes.</Note>
      ) : null}
      {view.receipt ? (
        <Note>
          {added} added · {view.receipt.ingredients.length - added} already added earlier. Existing
          grocery edits are kept.
        </Note>
      ) : null}
    </>
  );
}

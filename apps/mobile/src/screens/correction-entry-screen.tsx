import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import { CorrectionContextQuery, type CorrectionContext } from "@nest/contracts/correction-context";
import { useState, useSyncExternalStore } from "react";
import { Page, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { correctionSaveOwner } from "../money/correction-save-owner";
import { correctionSaveOperations } from "../money/correction-save-operations";
import type { CorrectionSaveRuntime } from "../money/correction-save-runtime";
import { useSaveActivity } from "../money/use-save-activity";
import { useCorrectionContext } from "../money/use-correction-context";
import { useCorrectionDraft } from "../money/use-correction-draft";
import { useEntryOptions } from "../money/use-entry-options";
import { CorrectionFields } from "../money/correction-fields";
import { CorrectionSaveStatus, correctionSaveEnabled } from "../money/correction-save-status";
import { formatChf } from "../money/format";
export default function CorrectionEntryScreen() {
  const { sourceEventId } = useLocalSearchParams();
  if (typeof sourceEventId !== "string" || !Schema.is(CorrectionContextQuery)({ sourceEventId }))
    return (
      <Page>
        <Note>This correction link is invalid.</Note>
      </Page>
    );
  return (
    <MoneyScreenGate>
      {(props) => (
        <Entry
          key={`${props.account.session.lease}:${sourceEventId}`}
          {...props}
          sourceEventId={sourceEventId}
        />
      )}
    </MoneyScreenGate>
  );
}
function Entry(props: MoneyScreenAccount & { sourceEventId: string }) {
  const [owner] = useState(() =>
    correctionSaveOwner(correctionSaveOperations(props.account, props.client)),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveEntry {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening correction entry…</Note>
    </Page>
  );
}
type ActiveProps = MoneyScreenAccount & { sourceEventId: string; runtime: CorrectionSaveRuntime };
function ActiveEntry(props: ActiveProps) {
  const { runtime } = props,
    view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  const context = useCorrectionContext(props, view.active && !view.verify, view.online);
  const options = useEntryOptions(props, view.active && !view.verify, view.online);
  const initial = context.initial;
  if (view.verify || context.verify || options.verify) return <VerifyMoney verify={props.verify} />;
  if (!initial)
    return (
      <InitialEntry
        runtime={runtime}
        view={view}
        context={context}
        actor={props.account.session.actor}
      />
    );
  return <Form {...props} initial={initial} view={view} context={context} options={options} />;
}
type FormProps = ActiveProps & {
  initial: CorrectionContext;
  view: ReturnType<CorrectionSaveRuntime["getSnapshot"]>;
  context: ReturnType<typeof useCorrectionContext>;
  options: ReturnType<typeof useEntryOptions>;
};
function Form(props: FormProps) {
  const { runtime, view, context, initial } = props,
    actor = props.account.session.actor;
  const draft = useCorrectionDraft(initial, context.value, runtime, {
    actor,
    reload: context.reload,
  });
  const recovery = view.attempt !== null || view.result !== null;
  if (!view.active)
    return (
      <Page>
        <Note>Correction entry is paused.</Note>
      </Page>
    );
  return (
    <Page>
      <Note>
        Corrections retain the original, append its reversal and optionally add a replacement. Nest
        does not transfer money.
      </Note>
      {!view.online ? (
        <Note>
          Go online to record or resolve a correction. Financial writes are never queued offline.
        </Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      {recovery ? (
        <CorrectionSaveStatus
          runtime={runtime}
          view={view}
          next={draft.nextCorrection}
          actor={actor}
        />
      ) : (
        <EntryFields {...props} draft={draft} />
      )}
      <NativeAction
        label="Check Save status"
        disabled={!view.online || view.busy}
        onPress={() => void runtime.refresh()}
      />
    </Page>
  );
}

function sortedOptions(
  options: ReturnType<typeof useEntryOptions>["value"],
  context: CorrectionContext,
) {
  if (!options) return null;
  const first = options.members.find(
    (member) => member.actorId === context.source.shares[0].memberId,
  );
  const second = options.members.find(
    (member) => member.actorId === context.source.shares[1].memberId,
  );
  return first && second ? { ...options, members: [first, second] as const } : null;
}

function EntryFields(props: FormProps & { draft: ReturnType<typeof useCorrectionDraft> }) {
  const { initial, view, context, options, draft } = props;
  const sorted = sortedOptions(options.value, initial);
  const disabled = !correctionSaveEnabled(view) || context.value === null || !options.fresh;
  return (
    <>
      <Section title="Original entry">
        <Note>
          {initial.source.event.description} · {formatChf(initial.source.event.amountCentimes)}
        </Note>
        {initial.source.event.hasReceipt ? (
          <Note>The original receipt reference will be retained on a replacement.</Note>
        ) : null}
      </Section>
      {context.value && sorted ? (
        <CorrectionFields
          draft={draft}
          context={context.value}
          options={sorted}
          disabled={disabled}
          next={options.next}
          first={options.first}
        />
      ) : (
        <Note>
          {context.failed || options.failed
            ? "Could not load current history or categories. Your input is retained."
            : "Loading current history and categories…"}
        </Note>
      )}
      <NativeAction
        label="Reload history and categories"
        disabled={!view.online || view.busy}
        onPress={() => {
          context.reload();
          options.reload();
        }}
      />
    </>
  );
}

function InitialEntry({
  runtime,
  view,
  context,
  actor,
}: Pick<FormProps, "runtime" | "view" | "context"> & { actor: string }) {
  if (!view.active)
    return (
      <Page>
        <Note>Correction entry is paused.</Note>
      </Page>
    );
  const recovery = view.attempt !== null || view.result !== null;
  return (
    <Page>
      {recovery ? (
        <CorrectionSaveStatus
          runtime={runtime}
          view={view}
          actor={actor}
          next={() => {
            context.reload();
            runtime.acknowledge();
          }}
        />
      ) : (
        <Note>
          {context.failed
            ? "Could not load this entry's current history."
            : "Loading current financial history…"}
        </Note>
      )}
      <NativeAction label="Reload entry" disabled={!view.online} onPress={context.reload} />
      <NativeAction
        label="Check Save status"
        disabled={!view.online || view.busy}
        onPress={() => void runtime.refresh()}
      />
    </Page>
  );
}

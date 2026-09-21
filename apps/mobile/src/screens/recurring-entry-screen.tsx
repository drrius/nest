import { Alert } from "react-native";
import { useState, useSyncExternalStore } from "react";
import { useLocalSearchParams } from "expo-router";
import * as Schema from "effect/Schema";
import * as Crypto from "expo-crypto";
import { RecurringDetailQuery } from "@nest/contracts/recurring-read";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { MoneyScreenGate, VerifyMoney, type MoneyScreenAccount } from "../money/screen-gate";
import { recurringSaveOwner } from "../money/recurring-save-owner";
import { recurringSaveOperations } from "../money/recurring-save-operations";
import type { RecurringSaveRuntime } from "../money/recurring-save-runtime";
import { useSaveActivity } from "../money/use-save-activity";
import { useRecurringContext } from "../money/use-recurring-context";
import { useEntryOptions } from "../money/use-entry-options";
import { useRecurringDraft } from "../money/use-recurring-draft";
import { recurringEntryEnabled } from "../money/recurring-confirmation";
import { RecurringFields } from "../money/recurring-fields";
import { RecurringSaveStatus } from "../money/recurring-save-status";
import type { RecurringEntryContext } from "../money/recurring-entry-context";
export default function RecurringEntryScreen() {
  const { ruleId } = useLocalSearchParams(),
    [newId] = useState(Crypto.randomUUID);
  if (ruleId !== undefined && !Schema.is(RecurringDetailQuery)({ ruleId }))
    return (
      <Page>
        <Note>Invalid recurring edit link.</Note>
      </Page>
    );
  const target = {
    ruleId: typeof ruleId === "string" ? ruleId.toLowerCase() : newId,
    editing: ruleId !== undefined,
  };
  return (
    <MoneyScreenGate>
      {(props) => (
        <Entry {...props} {...target} key={`${props.account.session.lease}:${target.ruleId}`} />
      )}
    </MoneyScreenGate>
  );
}
type Props = MoneyScreenAccount & { ruleId: string; editing: boolean };
function Entry(props: Props) {
  const [owner] = useState(() =>
    recurringSaveOwner(recurringSaveOperations(props.account, props.client)),
  );
  const runtime = useSyncExternalStore(owner.subscribe, owner.getSnapshot);
  return runtime ? (
    <ActiveEntry {...props} runtime={runtime} />
  ) : (
    <Page>
      <Note>Opening recurring setup…</Note>
    </Page>
  );
}
function ActiveEntry(props: Props & { runtime: RecurringSaveRuntime }) {
  const { runtime } = props,
    view = useSyncExternalStore(runtime.subscribe, runtime.getSnapshot);
  useSaveActivity(runtime);
  const active = view.active && !view.verify;
  const context = useRecurringContext(props, active, view.online);
  const options = useEntryOptions(props, active, view.online);
  if (view.verify || context.verify || options.verify) return <VerifyMoney verify={props.verify} />;
  const recovery = view.attempt !== null || view.result !== null;
  return (
    <Page>
      <EntryNotice view={view} />
      {context.initial ? (
        <Form {...props} initial={context.initial} current={context.value} options={options} />
      ) : recovery && view.active ? (
        <RecurringSaveStatus
          runtime={runtime}
          view={view}
          actor={props.account.session.actor}
          next={() => {
            runtime.acknowledge();
            context.reload();
          }}
        />
      ) : (
        <Note>
          {context.failed ? "Could not load recurring setup." : "Loading current recurring setup…"}
        </Note>
      )}
      <EntryActions runtime={runtime} context={context} options={options} />
    </Page>
  );
}
type FormProps = Props & {
  runtime: RecurringSaveRuntime;
  initial: RecurringEntryContext;
  current: RecurringEntryContext | null;
  options: ReturnType<typeof useEntryOptions>;
};
function Form(props: FormProps) {
  const { initial, current, runtime } = props;
  const draft = useRecurringDraft(
    initial.context,
    current?.context ?? null,
    runtime,
    props.account.session.actor,
  );
  const view = runtime.getSnapshot();
  if (!view.active) return null;
  if (view.attempt !== null || view.result !== null)
    return (
      <RecurringSaveStatus
        runtime={runtime}
        view={view}
        actor={props.account.session.actor}
        next={draft.nextExpense}
      />
    );
  return <ReadyFields {...props} draft={draft} />;
}
function ReadyFields({
  initial,
  current,
  options,
  runtime,
  draft,
}: FormProps & { draft: ReturnType<typeof useRecurringDraft> }) {
  const value = options.value;
  const members = value
    ? initial.context.members.map((id) => value.members.find((member) => member.actorId === id))
    : [];
  if (!value || !members[0] || !members[1])
    return (
      <Note>
        {options.failed
          ? "Could not load current members and categories."
          : "Loading members and categories…"}
      </Note>
    );
  return (
    <RecurringFields
      draft={draft}
      options={{ ...value, members: [members[0], members[1]] }}
      disabled={!current || !options.fresh || !recurringEntryEnabled(runtime.getSnapshot())}
      first={options.first}
      next={options.next}
    />
  );
}

type View = ReturnType<RecurringSaveRuntime["getSnapshot"]>;
function EntryNotice({ view }: { view: View }) {
  if (!view.active) return <Note>Recurring setup is paused.</Note>;
  return (
    <>
      {!view.online ? (
        <Note>
          Go online to save or resolve this configuration. Financial writes are not queued offline.
        </Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
    </>
  );
}
function EntryActions({
  runtime,
  context,
  options,
}: {
  runtime: RecurringSaveRuntime;
  context: ReturnType<typeof useRecurringContext>;
  options: ReturnType<typeof useEntryOptions>;
}) {
  const view = runtime.getSnapshot();
  const recovery = view.attempt !== null || view.result !== null;
  const disabled = !view.active || !view.online || view.busy;
  return (
    <>
      <NativeAction
        label="Discard input and reload configuration"
        disabled={disabled || recovery}
        onPress={() =>
          Alert.alert(
            "Discard unsaved input?",
            "Reload the current configuration before making new edits.",
            [
              { text: "Keep editing", style: "cancel" },
              { text: "Discard and reload", style: "destructive", onPress: context.reset },
            ],
          )
        }
      />
      <NativeAction
        label="Reload current setup"
        disabled={disabled}
        onPress={() => {
          context.reload();
          options.reload();
        }}
      />
      <NativeAction
        label="Check Save status"
        disabled={disabled}
        onPress={() => void runtime.refresh()}
      />
    </>
  );
}

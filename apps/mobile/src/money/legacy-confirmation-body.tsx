import { useSyncExternalStore } from "react";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { VerifyMoney, type MoneyScreenAccount } from "./screen-gate";
import type { RecurringReadRuntime } from "./recurring-read-runtime";
import type {
  LegacyConfirmationSaveRuntime,
  LegacyConfirmationSaveView,
} from "./legacy-confirmation-save-runtime";
import { useSaveActivity } from "./use-save-activity";
import { useEntryOptions } from "./use-entry-options";
import { legacyConfirmationContext } from "./legacy-confirmation-context";
import { useLegacyConfirmationBaseline } from "./use-legacy-confirmation-baseline";
import { LegacyConfirmationForm } from "./legacy-confirmation-form";
import { ConfirmationRecovery } from "./legacy-confirmation-recovery";
import { useLeaveLegacyConfirmation } from "./use-leave-legacy-confirmation";
interface Props extends MoneyScreenAccount {
  read: RecurringReadRuntime;
  save: LegacyConfirmationSaveRuntime;
}
export function LegacyConfirmationBody(props: Props) {
  const { read, save } = props;
  const source = useSyncExternalStore(read.subscribe, read.getSnapshot),
    view = useSyncExternalStore(save.subscribe, save.getSnapshot);
  useSaveActivity(read);
  useSaveActivity(save);
  const options = useEntryOptions(props, view.active, view.online);
  const current = legacyConfirmationContext(source, view, options);
  const { baseline, reset } = useLegacyConfirmationBaseline(current, read, save);
  const refresh = () => {
    void read.refresh();
    void save.refresh();
    options.reload();
  };
  if (source.verify || view.verify || options.verify) return <VerifyMoney verify={props.verify} />;
  return (
    <Page>
      <Status source={source.notice} view={view} failed={options.failed} />
      {view.attempt || view.result ? (
        <Recovery
          runtime={save}
          actor={props.account.session.actor}
          view={view}
          next={() => {
            save.acknowledge();
            refresh();
          }}
        />
      ) : baseline ? (
        <LegacyConfirmationForm
          key={baseline.revision}
          initial={baseline.context}
          current={current}
          read={read}
          save={save}
          actor={props.account.session.actor}
          visible={view.active}
          first={options.first}
          next={options.next}
          reset={reset}
        />
      ) : (
        <Note>Loading draft, household and saved request…</Note>
      )}
      <NativeAction
        label="Reload draft and request status"
        disabled={!view.active || !view.online || view.busy || source.busy}
        onPress={refresh}
      />
    </Page>
  );
}
function Recovery({
  runtime,
  view,
  next,
  actor,
}: {
  runtime: LegacyConfirmationSaveRuntime;
  view: LegacyConfirmationSaveView;
  next: () => void;
  actor: string;
}) {
  useLeaveLegacyConfirmation(
    runtime,
    () => false,
    () => {},
  );
  return view.active ? (
    <ConfirmationRecovery runtime={runtime} view={view} next={next} actor={actor} />
  ) : (
    <Note>Draft details are hidden while inactive.</Note>
  );
}

function Status({
  source,
  view,
  failed,
}: {
  source: string | null;
  view: LegacyConfirmationSaveView;
  failed: boolean;
}) {
  return (
    <>
      {!view.online ? (
        <Note>Connect to confirm this draft. Financial writes are not queued offline.</Note>
      ) : null}
      {[source, view.notice].filter(Boolean).map((notice, i) => (
        <Note key={i}>{notice}</Note>
      ))}
      {failed ? (
        <Note>Could not load current household members and categories. Reload to retry.</Note>
      ) : null}
    </>
  );
}

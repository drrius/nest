import { useSyncExternalStore } from "react";
import { Page, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { VerifyMoney, type MoneyScreenAccount } from "./screen-gate";
import type { RecurringReadRuntime } from "./recurring-read-runtime";
import type {
  LegacyAdoptionSaveRuntime,
  LegacyAdoptionSaveView,
} from "./legacy-adoption-save-runtime";
import { useSaveActivity } from "./use-save-activity";
import { useEntryOptions } from "./use-entry-options";
import { adoptionFormContext } from "./legacy-adoption-context";
import { useLegacyAdoptionBaseline } from "./use-legacy-adoption-baseline";
import { LegacyAdoptionForm } from "./legacy-adoption-form";
import { AdoptionRecovery } from "./legacy-adoption-recovery";
import { useLeaveLegacyAdoption } from "./use-leave-legacy-adoption";
interface Props extends MoneyScreenAccount {
  read: RecurringReadRuntime;
  save: LegacyAdoptionSaveRuntime;
}
export function LegacyAdoptionBody(props: Props) {
  const { read, save } = props;
  const source = useSyncExternalStore(read.subscribe, read.getSnapshot),
    view = useSyncExternalStore(save.subscribe, save.getSnapshot);
  useSaveActivity(read);
  useSaveActivity(save);
  const options = useEntryOptions(props, view.active, view.online);
  const current = adoptionFormContext(source, view, options);
  const { baseline, reset } = useLegacyAdoptionBaseline(current, read, save);
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
        <LegacyAdoptionForm
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
        <Note>Loading rule, household and saved request…</Note>
      )}
      <NativeAction
        label="Reload rule and request status"
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
  runtime: LegacyAdoptionSaveRuntime;
  view: LegacyAdoptionSaveView;
  next: () => void;
  actor: string;
}) {
  useLeaveLegacyAdoption(
    runtime,
    () => false,
    () => {},
  );
  return view.active ? (
    <AdoptionRecovery runtime={runtime} view={view} next={next} actor={actor} />
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
  view: LegacyAdoptionSaveView;
  failed: boolean;
}) {
  return (
    <>
      {!view.online ? (
        <Note>Connect to adopt this rule. Financial writes are not queued offline.</Note>
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

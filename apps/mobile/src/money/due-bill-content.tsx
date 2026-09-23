import { Link } from "expo-router";
import type { RecurringRule } from "@nest/contracts/recurring-read";
import type { RecurringReadRuntime, RecurringReadView } from "./recurring-read-runtime";
import { Card, Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import { useQuiet } from "../theme";
export function DueBillRow({ rule }: { rule: RecurringRule }) {
  const colors = useQuiet();
  return (
    <Card>
      <Note>Due {rule.nextDueOn} · Amount and split needed</Note>
      <Link
        href={{ pathname: "/recurring-variable", params: { ruleId: rule.ruleId } }}
        style={{ color: colors.text, fontSize: 19, paddingVertical: 12 }}
      >
        Review {rule.configuration.description}
      </Link>
    </Card>
  );
}
export function DueBillStatus({
  view,
  runtime,
  verify,
}: {
  view: RecurringReadView;
  runtime: RecurringReadRuntime;
  verify: () => void;
}) {
  return (
    <>
      <Note>Review each bill’s amount and split before recording the expense.</Note>
      {!view.online ? <Note>Connect to view bills awaiting confirmation.</Note> : null}
      {view.busy ? <Note>Checking due bills…</Note> : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <NativeAction
        label={view.verify ? "Verify account and retry" : "Refresh due bills"}
        disabled={!view.active || !view.online || view.busy}
        onPress={() => {
          if (view.verify) verify();
          void runtime.refresh();
        }}
      />
    </>
  );
}

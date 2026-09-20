import type { Chore } from "@nest/contracts/chores";
import { Card, Note, Section } from "../components/page";
import { NativeAction } from "../components/native-action";
export function ChoreTransferForm({
  chore,
  partner,
  disabled,
  submit,
  dismiss,
}: {
  chore: Chore;
  partner: string;
  disabled: boolean;
  submit: () => void;
  dismiss: () => void;
}) {
  return (
    <Card>
      <Section title={`Hand over ${chore.title}`} />
      <Note>
        Ask {partner || "your partner"} to take this occurrence, due {chore.dueDate}. It stays your
        responsibility until they accept. Future turns stay unchanged.
      </Note>
      <Note>Needs a connection. Keep the app open until the outcome is confirmed.</Note>
      <NativeAction label="Send handover request" disabled={disabled} onPress={submit} />
      <NativeAction label="Cancel" disabled={disabled} onPress={dismiss} />
    </Card>
  );
}

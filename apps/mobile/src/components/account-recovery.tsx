import { NativeAction } from "./native-action";

export function AccountRecovery({
  verify,
  reload,
  busy = false,
}: {
  verify: () => void;
  reload: () => Promise<void>;
  busy?: boolean;
}) {
  return (
    <>
      <NativeAction label="Verify account" disabled={busy} onPress={verify} />
      <NativeAction
        label="Reload current details"
        disabled={busy}
        onPress={() => {
          void reload();
        }}
      />
    </>
  );
}

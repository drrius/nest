import { View } from "react-native";
import { Note } from "../components/page";
import { NativeAction } from "../components/native-action";
import type { MoneyReadView } from "./read-runtime";
import { space } from "../theme";
export function MoneyReadStatus({
  view,
  reload,
  label,
}: {
  view: MoneyReadView;
  reload: () => void;
  label: string;
}) {
  return (
    <View style={{ gap: space.small }}>
      {view.busy ? <Note>Loading {label}…</Note> : null}
      {view.entry ? (
        <Note>
          {view.source === "online" ? "Loaded online" : "Previously loaded"} ·{" "}
          {view.entry.savedAt.slice(0, 19).replace("T", " ")} UTC
        </Note>
      ) : null}
      {view.source !== "online" && view.entry ? (
        <Note>These values may be out of date. Money changes require a connection.</Note>
      ) : null}
      {view.notice ? <Note>{view.notice}</Note> : null}
      <NativeAction
        label={`Refresh ${label}`}
        disabled={view.busy || view.access !== "ready"}
        onPress={reload}
      />
    </View>
  );
}

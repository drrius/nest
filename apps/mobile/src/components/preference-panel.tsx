import type { PropsWithChildren } from "react";
import { Alert } from "react-native";
import type { PreferenceView } from "../preferences/contracts";
import { Page, Note } from "./page";
import { NativeAction } from "./native-action";
export function PreferencePanel({
  view,
  actions,
  children,
}: PropsWithChildren<{
  view: Pick<PreferenceView<unknown>, "loaded" | "busy" | "stage" | "notice">;
  actions: { load: () => Promise<void>; retry: () => Promise<void>; verify: () => void };
}>) {
  const reload = () => {
    void actions.load();
  };
  const review = () =>
    Alert.alert(
      "Reload saved preferences?",
      "This replaces the unsaved form with the current saved preferences.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Reload", onPress: reload },
      ],
    );
  return (
    <Page>
      {view.notice ? <Note>{view.notice}</Note> : null}
      {view.stage === "verify" ? (
        <NativeAction
          label="Verify account"
          disabled={view.busy}
          onPress={() => {
            actions.verify();
            reload();
          }}
        />
      ) : (
        <>
          {view.loaded ? (
            children
          ) : (
            <Note>{view.busy ? "Loading preferences…" : "Preferences have not been loaded."}</Note>
          )}
          {view.stage === "uncertain" ? (
            <NativeAction
              label="Retry exact save"
              disabled={view.busy}
              onPress={() => {
                void actions.retry();
              }}
            />
          ) : null}
          {view.stage === "conflict" || view.stage === "reload" || !view.loaded ? (
            <NativeAction
              label="Reload saved preferences"
              disabled={view.busy}
              onPress={view.stage === "conflict" ? review : reload}
            />
          ) : null}
        </>
      )}
      <Note>
        Changes require a connection. Drafts and retry details are kept only while this form is
        open.
      </Note>
    </Page>
  );
}

import { useRouter } from "expo-router";
import { NativeAction } from "../components/native-action";
import { Note, Page, Section } from "../components/page";
import { usePreview } from "../preview/preview-state";

export default function PreviewSettingsScreen() {
  const state = usePreview();
  const router = useRouter();
  return (
    <Page>
      <Section title="Review Quiet">
        <Note>
          This is an isolated interaction preview. No sign-in, personal information or server writes
          are involved.
        </Note>
        <Note>Use iPhone Settings to try large text, VoiceOver, Reduce Motion and dark mode.</Note>
      </Section>
      <NativeAction label="Reset sample chores and groceries" onPress={state.reset} />
      <NativeAction label="Leave preview" onPress={() => router.dismissTo("/")} />
    </Page>
  );
}

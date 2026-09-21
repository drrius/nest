import { Link } from "expo-router";
import { Note, Page, Section } from "../components/page";
import { SignInCard } from "../components/sign-in-card";
import { useQuiet } from "../theme";

export default function WelcomeScreen() {
  const colors = useQuiet();
  return (
    <Page>
      <Section title="A little less to remember.">
        <Note>One place for your household’s day, meals and shared expenses.</Note>
      </Section>
      <SignInCard />
      {__DEV__ ? (
        <Section title="Quiet design preview">
          <Note>
            Screens labeled as fictional are local design examples. Calendar uses your signed-in
            account and actual device calendars.
          </Note>
          <Link
            href="/today"
            style={{ color: colors.accent, fontSize: 17, paddingVertical: 16 }}
            accessibilityRole="button"
          >
            Open interaction preview
          </Link>
        </Section>
      ) : null}
    </Page>
  );
}

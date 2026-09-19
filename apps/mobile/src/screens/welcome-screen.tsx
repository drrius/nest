import { Link } from "expo-router";
import { Text } from "react-native";
import { Card, Note, Page, Section } from "../components/page";
import { useQuiet } from "../theme";

export default function WelcomeScreen() {
  const colors = useQuiet();
  return (
    <Page>
      <Section title="A little less to remember.">
        <Note>One place for your household’s day, meals and shared expenses.</Note>
      </Section>
      <Card>
        <Text selectable style={{ fontSize: 17, color: colors.text }}>
          This build is not connected to your household yet.
        </Text>
        <Note>
          Apple sign-in and household services are being connected. No personal data is loaded.
        </Note>
      </Card>
      {__DEV__ ? (
        <Section title="Quiet design preview">
          <Note>
            Explore fictional examples. Changes last only for this app session and are never sent to
            a server.
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

import { Note, Page, Section } from "../components/page";
import { SignInCard } from "../components/sign-in-card";

export default function WelcomeScreen() {
  return (
    <Page>
      <Section title="A little less to remember.">
        <Note>One place for your household’s day, meals and shared expenses.</Note>
      </Section>
      <SignInCard />
    </Page>
  );
}

import { useRouter } from "expo-router";
import { useSession } from "../session/provider";
import { Page, Section, Note } from "../components/page";
import { NavigationRow } from "../components/navigation-row";
import { SignInCard } from "../components/sign-in-card";

export default function SettingsScreen() {
  const session = useSession(),
    router = useRouter();
  if (session.state.status !== "ready")
    return (
      <Page>
        <SignInCard />
      </Page>
    );
  return (
    <Page>
      <Note>{session.state.member.displayName} · Your personal choices</Note>
      <Section title="For you">
        <NavigationRow
          title="Food preferences"
          detail="Dietary needs, portions and optional calorie goal"
          onPress={() => router.push("/food-preferences")}
        />
        <NavigationRow
          title="Notifications"
          detail="Daily summary and item reminders"
          onPress={() => router.push("/notification-preferences")}
        />
        <NavigationRow
          title="Calendar access & sharing"
          detail="Choose calendars and share busy times"
          onPress={() => router.push("/calendar-sharing")}
        />
        <NavigationRow
          title="Private memory"
          detail="What you choose to let Nest remember"
          onPress={() => router.push("/memory")}
        />
      </Section>
      <Section title="Together">
        <NavigationRow
          title="Cooking preferences"
          detail="Household choices and meal slots"
          onPress={() => router.push("/cooking-preferences")}
        />
      </Section>
      <Section title="Account">
        <NavigationRow title="Continue setup" onPress={() => router.push("/setup")} />
        <NavigationRow title="Household account" onPress={() => router.push("/")} />
      </Section>
    </Page>
  );
}

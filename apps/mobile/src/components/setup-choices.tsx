import { useRouter } from "expo-router";
import type { SetupStatus } from "@nest/contracts/setup";
import { Section } from "./page";
import { NavigationRow } from "./navigation-row";

const configured = (value: boolean | undefined) =>
  value === undefined ? "Status not checked" : value ? "Saved" : "Not set up yet";

export function SetupChoices({ status }: { status: SetupStatus | null }) {
  const router = useRouter();
  return (
    <>
      <Section title="Meals together">
        <NavigationRow
          title="Your food preferences"
          detail={`${configured(status?.foodConfigured)} · Restrictions, dislikes and portions`}
          onPress={() => router.push("/food-preferences")}
        />
        <NavigationRow
          title="Household cooking"
          detail={`${configured(status?.cookingConfigured)} · Shared cooking choices and meal slots`}
          onPress={() => router.push("/cooking-preferences")}
        />
      </Section>
      <Section title="Make it yours · optional">
        <NavigationRow
          title="Notifications"
          detail={`${configured(status?.notificationsConfigured)} · Daily summary and reminders`}
          onPress={() => router.push("/notification-preferences")}
        />
        <NavigationRow
          title="Calendar access & sharing"
          detail="Personal details stay on your iPhone. Share busy times only if you choose."
          onPress={() => router.push("/calendar-sharing")}
        />
        <NavigationRow
          title="Private memory"
          detail="Only remember what you explicitly choose."
          onPress={() => router.push("/memory")}
        />
      </Section>
    </>
  );
}

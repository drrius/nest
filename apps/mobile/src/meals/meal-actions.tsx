import { useRouter } from "expo-router";
import type { MealWeekSnapshot } from "@nest/contracts/meals";
import { ActionMenu } from "../components/action-menu";
import type { MenuAction } from "../components/action-menu-types";

export function MealActions({
  meal,
  weekStart,
  enabled,
}: {
  meal: MealWeekSnapshot["entries"][number];
  weekStart: string;
  enabled: boolean;
}) {
  const router = useRouter(),
    entryId = meal.entryId;
  const actions: MenuAction[] = [
    {
      label: "Preparation",
      onPress: () => router.push({ pathname: "/meal-preparation", params: { weekStart, entryId } }),
    },
    {
      label: "Meal reminder",
      disabled: !enabled,
      onPress: () => router.push({ pathname: "/meal-reminder", params: { entryId } }),
    },
    {
      label: "Replace meal",
      disabled: !enabled,
      onPress: () =>
        router.push({
          pathname: "/meal-replace",
          params: { weekStart, entryId, date: meal.date, slot: meal.slot },
        }),
    },
    {
      label: "Move meal",
      disabled: !enabled,
      onPress: () =>
        router.push({ pathname: "/meal-move", params: { sourceWeekStart: weekStart, entryId } }),
    },
  ];
  if (!meal.leftoverSourceId)
    actions.push({
      label: "Plan leftovers",
      disabled: !enabled,
      onPress: () =>
        router.push({
          pathname: "/meal-leftovers",
          params: { sourceWeekStart: weekStart, entryId },
        }),
    });
  actions.push({
    label: "Remove meal",
    disabled: !enabled,
    onPress: () => router.push({ pathname: "/meal-remove", params: { weekStart, entryId } }),
  });
  return <ActionMenu label={`Actions for ${meal.title}`} actions={actions} />;
}

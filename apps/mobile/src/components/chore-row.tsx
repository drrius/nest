import { Pressable, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import type { ChoreData } from "../chores/flow";
import { useQuiet, space } from "../theme";

export function ChoreRow({
  chore,
  actor,
  onComplete,
  disabled = false,
}: {
  chore: ChoreData["chores"][number];
  actor: string;
  onComplete: () => void;
  disabled?: boolean;
}) {
  const colors = useQuiet();
  const owner =
    chore.assigneeId === null ? "Shared" : chore.assigneeId === actor ? "You" : "Partner";
  const inactive = disabled || chore.done || chore.pending;
  const detail = `${chore.dueDate} · ${owner}${chore.pending ? " · Awaiting sync" : ""}`;
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`${chore.title}, ${detail}`}
      accessibilityState={{
        checked: chore.done,
        disabled: inactive,
      }}
      accessibilityHint="Mark this chore complete"
      disabled={inactive}
      onPress={onComplete}
      style={{
        minHeight: 64,
        flex: 1,
        flexDirection: "row",
        alignItems: "center",
        gap: space.medium,
        paddingVertical: space.small,
      }}
    >
      <SymbolView
        name={chore.done ? "checkmark.circle.fill" : "circle"}
        tintColor={colors.accent}
        size={28}
      />
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            fontSize: 17,
            fontWeight: "500",
            color: colors.text,
            textDecorationLine: chore.done ? "line-through" : "none",
          }}
        >
          {chore.title}
        </Text>
        <Text style={{ fontSize: 15, color: colors.muted }}>{detail}</Text>
      </View>
    </Pressable>
  );
}

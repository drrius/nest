import { Pressable, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { space, useQuiet } from "../theme";

export function CheckRow({
  item,
  onPress,
  completionOnly = false,
}: {
  item: { title: string; detail: string; done: boolean };
  onPress: () => void;
  completionOnly?: boolean;
}) {
  const colors = useQuiet();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={`${item.title}, ${item.detail}`}
      accessibilityState={{ checked: item.done, disabled: completionOnly && item.done }}
      accessibilityHint={
        completionOnly
          ? "Mark this chore complete in the preview"
          : "Change checked state in the preview"
      }
      disabled={completionOnly && item.done}
      onPress={onPress}
      style={{
        minHeight: 64,
        flexDirection: "row",
        alignItems: "center",
        gap: space.medium,
        paddingVertical: space.small,
      }}
    >
      <SymbolView
        name={item.done ? "checkmark.circle.fill" : "circle"}
        tintColor={colors.accent}
        size={28}
      />
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          style={{
            fontSize: 17,
            fontWeight: "500",
            color: colors.text,
            textDecorationLine: item.done ? "line-through" : "none",
          }}
        >
          {item.title}
        </Text>
        <Text style={{ fontSize: 15, color: colors.muted }}>{item.detail}</Text>
      </View>
    </Pressable>
  );
}

import { Pressable, Text, View } from "react-native";
import { SymbolView } from "expo-symbols";
import { radius, space, type, useQuiet } from "../theme";

export function NavigationRow({
  title,
  detail,
  onPress,
}: {
  title: string;
  detail?: string;
  onPress: () => void;
}) {
  const colors = useQuiet();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: space.medium,
        minHeight: 64,
        padding: space.medium,
        backgroundColor: colors.surface,
        borderRadius: radius.control,
        borderCurve: "continuous",
        opacity: pressed ? 0.65 : 1,
      })}
    >
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={{ ...type.action, color: colors.text }}>{title}</Text>
        {detail ? <Text style={{ ...type.detail, color: colors.muted }}>{detail}</Text> : null}
      </View>
      <SymbolView name="chevron.right" tintColor={colors.muted} size={14} />
    </Pressable>
  );
}

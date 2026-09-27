import { Pressable, Text } from "react-native";
import { useQuiet } from "../theme";

export function QuietAction({
  label,
  onPress,
  disabled = false,
  expanded,
  maxFontSizeMultiplier,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  expanded?: boolean;
  maxFontSizeMultiplier?: number;
}) {
  const colors = useQuiet();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled, expanded }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        justifyContent: "center",
        opacity: disabled ? 0.5 : pressed ? 0.65 : 1,
      })}
    >
      <Text
        maxFontSizeMultiplier={maxFontSizeMultiplier}
        style={{ color: colors.accent, fontSize: 17 }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

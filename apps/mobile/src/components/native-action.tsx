import { Pressable, Text } from "react-native";
import { radius, space, type, useQuiet } from "../theme";

// The universal native Button uses an intrinsic capsule on iOS. Quiet's main
// actions need a full-width rounded rectangle and a label that can wrap.
export function NativeAction({
  label,
  onPress,
  disabled = false,
  variant = "secondary",
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "quiet";
}) {
  const colors = useQuiet();
  const background =
    variant === "primary" ? colors.accent : variant === "secondary" ? colors.soft : "transparent";
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 48,
        alignSelf: "stretch",
        alignItems: "center",
        justifyContent: "center",
        paddingHorizontal: space.medium,
        paddingVertical: space.small,
        borderRadius: radius.control,
        borderCurve: "continuous",
        backgroundColor: background,
        opacity: disabled ? 0.45 : pressed ? 0.7 : 1,
      })}
    >
      <Text
        style={{
          ...type.action,
          textAlign: "center",
          color: variant === "primary" ? colors.onAccent : colors.accent,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

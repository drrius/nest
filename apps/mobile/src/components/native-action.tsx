import { Button, Host } from "@expo/ui";
import { useColorScheme } from "react-native";
import { useQuiet } from "../theme";

export function NativeAction({
  label,
  onPress,
  disabled,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useQuiet();
  const scheme = useColorScheme();
  return (
    <Host
      matchContents
      colorScheme={scheme === "dark" ? "dark" : "light"}
      seedColor={colors.accent}
    >
      <Button label={label} onPress={onPress} disabled={disabled} />
    </Host>
  );
}

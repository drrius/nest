import { Button, Host } from "@expo/ui";
import { useColorScheme } from "react-native";
import { useQuiet } from "../theme";

export function NativeAction({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useQuiet();
  const scheme = useColorScheme();
  return (
    <Host
      matchContents
      colorScheme={scheme === "dark" ? "dark" : "light"}
      seedColor={colors.accent}
    >
      <Button label={label} onPress={onPress} />
    </Host>
  );
}

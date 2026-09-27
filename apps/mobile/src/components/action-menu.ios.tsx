import { Host } from "@expo/ui";
import { Button, Label, Menu } from "@expo/ui/swift-ui";
import { accessibilityLabel, disabled, frame, labelStyle } from "@expo/ui/swift-ui/modifiers";
import { useColorScheme } from "react-native";
import { useQuiet } from "../theme";
import type { ActionMenuProps } from "./action-menu-types";

export function ActionMenu({ label, actions }: ActionMenuProps) {
  const colors = useQuiet(),
    scheme = useColorScheme();
  return (
    <Host
      matchContents
      colorScheme={scheme === "dark" ? "dark" : "light"}
      seedColor={colors.accent}
    >
      <Menu
        label={<Label title="More" systemImage="ellipsis" modifiers={[labelStyle("iconOnly")]} />}
        modifiers={[frame({ minWidth: 44, minHeight: 44 }), accessibilityLabel(label)]}
      >
        {actions.map((action) => (
          <Button
            key={action.label}
            label={action.label}
            onPress={action.onPress}
            modifiers={[disabled(action.disabled ?? false)]}
          />
        ))}
      </Menu>
    </Host>
  );
}

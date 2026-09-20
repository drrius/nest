import { Host } from "@expo/ui";
import { Button, Menu } from "@expo/ui/swift-ui";
import { accessibilityLabel, disabled, frame } from "@expo/ui/swift-ui/modifiers";
import { useColorScheme } from "react-native";
import { useQuiet } from "../theme";
import type { ChoreMenuProps } from "./menu-types";

export function ChoreMenu(props: ChoreMenuProps) {
  const colors = useQuiet();
  const scheme = useColorScheme();
  return (
    <Host
      matchContents
      colorScheme={scheme === "dark" ? "dark" : "light"}
      seedColor={colors.accent}
    >
      <Menu
        label="More"
        systemImage="ellipsis.circle"
        modifiers={[
          disabled(props.disabled),
          frame({ minWidth: 44, minHeight: 44 }),
          accessibilityLabel(`Actions for ${props.chore.title}`),
        ]}
      >
        <Button
          label="Reschedule"
          systemImage="calendar"
          onPress={() => props.choose({ chore: props.chore, action: "reschedule" })}
        />
        <Button
          label="Skip this occurrence"
          systemImage="forward.end"
          onPress={() => props.choose({ chore: props.chore, action: "skip" })}
        />
        {props.canTransfer ? (
          <Button
            label="Ask partner to take this turn"
            systemImage="person.2"
            onPress={() => props.choose({ chore: props.chore, action: "transfer" })}
          />
        ) : null}
      </Menu>
    </Host>
  );
}

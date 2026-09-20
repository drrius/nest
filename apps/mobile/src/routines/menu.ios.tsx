import { Host } from "@expo/ui";
import { Button, Menu } from "@expo/ui/swift-ui";
import { accessibilityLabel, disabled, frame } from "@expo/ui/swift-ui/modifiers";
import { useColorScheme } from "react-native";
import { useQuiet } from "../theme";
import type { RoutineMenuProps } from "./menu-types";

export function RoutineMenu(props: RoutineMenuProps) {
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
          accessibilityLabel(`Actions for ${props.title}`),
        ]}
      >
        <Button label="Edit routine" systemImage="pencil" onPress={props.edit} />
        <Button
          label={props.paused ? "Resume routine" : "Pause routine"}
          systemImage={props.paused ? "play" : "pause"}
          onPress={() => props.changeState(props.paused ? "resume" : "pause")}
        />
        <Button
          label="Archive routine"
          systemImage="archivebox"
          role="destructive"
          onPress={() => props.changeState("archive")}
        />
      </Menu>
    </Host>
  );
}

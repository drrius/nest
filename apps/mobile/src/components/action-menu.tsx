import { View } from "react-native";
import { NativeAction } from "./native-action";
import type { ActionMenuProps } from "./action-menu-types";

export function ActionMenu({ label, actions }: ActionMenuProps) {
  return (
    <View accessibilityLabel={label}>
      {actions.map((action) => (
        <NativeAction key={action.label} {...action} />
      ))}
    </View>
  );
}

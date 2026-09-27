import { Host } from "@expo/ui";
import { Button, HStack, Menu } from "@expo/ui/swift-ui";
import { accessibilityLabel, frame, labelStyle } from "@expo/ui/swift-ui/modifiers";
import { useRouter } from "expo-router";
import { useColorScheme } from "react-native";
import { useQuiet } from "../theme";
import { todayMoreActions } from "./more-actions";

export function TodayMenus({ transfers, refresh }: { transfers: number; refresh: () => void }) {
  const router = useRouter(),
    colors = useQuiet(),
    scheme = useColorScheme();
  const target = [frame({ minWidth: 44, minHeight: 44 }), labelStyle("iconOnly")];
  return (
    <Host
      matchContents
      colorScheme={scheme === "dark" ? "dark" : "light"}
      seedColor={colors.accent}
    >
      <HStack spacing={8}>
        <Menu
          label="Add"
          systemImage="plus"
          modifiers={[...target, accessibilityLabel("Add to your household")]}
        >
          <Button
            label="Chore"
            systemImage="checklist"
            onPress={() => router.push({ pathname: "/routines", params: { action: "create" } })}
          />
          <Button
            label="Grocery"
            systemImage="basket"
            onPress={() => router.push("/grocery-edit")}
          />
          <Button
            label="Expense"
            systemImage="creditcard"
            onPress={() => router.push("/expense-entry")}
          />
        </Menu>
        <Menu
          label="More"
          systemImage="ellipsis"
          modifiers={[...target, accessibilityLabel("More household actions")]}
        >
          <Button
            label="Refresh and retry chores"
            systemImage="arrow.clockwise"
            onPress={refresh}
          />
          {todayMoreActions.map((action) => (
            <Button
              key={action.href}
              label={
                action.href === "/chore-transfers" && transfers
                  ? `${action.label} · ${transfers}`
                  : action.label
              }
              systemImage={action.symbol}
              onPress={() => router.push(action.href)}
            />
          ))}
        </Menu>
      </HStack>
    </Host>
  );
}

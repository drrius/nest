import type { PropsWithChildren } from "react";
import { ScrollView, Text, View } from "react-native";
import { space, type, useQuiet } from "../theme";

export function Page({ children }: PropsWithChildren) {
  const colors = useQuiet();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      automaticallyAdjustKeyboardInsets
      keyboardShouldPersistTaps="handled"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{ padding: space.large, gap: space.large, paddingBottom: 48 }}
    >
      {children}
    </ScrollView>
  );
}

export function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  const colors = useQuiet();
  return (
    <View style={{ gap: space.medium }}>
      <Text accessibilityRole="header" style={{ ...type.section, color: colors.text }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

export function Note({
  children,
  maxFontSizeMultiplier,
}: PropsWithChildren<{ maxFontSizeMultiplier?: number }>) {
  const colors = useQuiet();
  return (
    <Text
      selectable
      maxFontSizeMultiplier={maxFontSizeMultiplier}
      style={{ ...type.body, color: colors.muted }}
    >
      {children}
    </Text>
  );
}

export function Card({ children }: PropsWithChildren) {
  const colors = useQuiet();
  return (
    <View
      style={{
        backgroundColor: colors.surface,
        padding: space.medium,
        borderRadius: 20,
        borderCurve: "continuous",
        gap: space.small,
      }}
    >
      {children}
    </View>
  );
}

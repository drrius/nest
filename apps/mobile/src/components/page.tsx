import type { PropsWithChildren } from "react";
import { ScrollView, Text, View } from "react-native";
import { space, useQuiet } from "../theme";

export function Page({ children }: PropsWithChildren) {
  const colors = useQuiet();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
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
      <Text
        accessibilityRole="header"
        style={{ color: colors.text, fontSize: 22, fontWeight: "600" }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

export function Note({ children }: PropsWithChildren) {
  const colors = useQuiet();
  return (
    <Text selectable style={{ color: colors.muted, fontSize: 17, lineHeight: 25 }}>
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

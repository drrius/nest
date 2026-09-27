import { Link } from "expo-router";
import { SymbolView } from "expo-symbols";
import { Pressable, Text, View } from "react-native";
import { space, useQuiet } from "../theme";
export function TodayGroceries() {
  const colors = useQuiet();
  return (
    <Link href="/checklist" asChild>
      <Pressable
        accessibilityRole="link"
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: space.medium,
          padding: space.medium,
          borderRadius: 20,
          borderCurve: "continuous",
          backgroundColor: colors.surface,
          minHeight: 76,
        }}
      >
        <SymbolView name="basket" size={24} tintColor={colors.accent} />
        <View style={{ flex: 1, gap: space.small }}>
          <Text style={{ color: colors.text, fontSize: 19, fontWeight: "600" }}>Groceries</Text>
          <Text style={{ color: colors.muted, fontSize: 15 }}>Your shared shopping list</Text>
        </View>
        <SymbolView name="chevron.right" size={16} tintColor={colors.muted} />
      </Pressable>
    </Link>
  );
}

import { Text, View } from "react-native";
import { space, useQuiet } from "../theme";
import { formatChf } from "./format";

export function MoneyBalanceCard({ centimes }: { centimes: string | undefined }) {
  const colors = useQuiet();
  const amount = centimes === undefined ? null : BigInt(centimes);
  const label =
    amount === null
      ? "Your shared balance"
      : amount === 0n
        ? "You’re settled up"
        : amount > 0n
          ? "Your partner owes you"
          : "You owe your partner";
  const absolute = amount === null ? null : (amount < 0n ? -amount : amount).toString();
  return (
    <View
      style={{
        paddingVertical: space.medium,
        gap: space.small,
      }}
    >
      <Text style={{ color: colors.text, fontSize: 17 }}>{label}</Text>
      <Text
        selectable
        style={{
          color: colors.text,
          fontSize: 40,
          fontWeight: "500",
          fontVariant: ["tabular-nums"],
        }}
      >
        {absolute === null ? "—" : formatChf(absolute)}
      </Text>
      <Text style={{ color: colors.muted, fontSize: 15 }}>Across your shared expenses</Text>
    </View>
  );
}

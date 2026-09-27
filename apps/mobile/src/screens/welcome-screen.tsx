import { ScrollView, Text, View } from "react-native";
import { SignInCard } from "../components/sign-in-card";
import { space, type, useQuiet } from "../theme";

export default function WelcomeScreen() {
  const colors = useQuiet();
  return (
    <ScrollView
      contentInsetAdjustmentBehavior="automatic"
      style={{ flex: 1, backgroundColor: colors.background }}
      contentContainerStyle={{
        flexGrow: 1,
        padding: space.large,
        paddingTop: 48,
        paddingBottom: 48,
        gap: 48,
      }}
    >
      <View style={{ gap: space.medium }}>
        <Text accessibilityRole="header" style={{ ...type.display, color: colors.text }}>
          A little less{"\n"}to remember.
        </Text>
        <Text style={{ ...type.body, color: colors.muted }}>
          Your day, meals and shared expenses. A little more settled, together.
        </Text>
      </View>
      <SignInCard welcome />
    </ScrollView>
  );
}

import { ThemeProvider, DarkTheme, DefaultTheme } from "expo-router/react-navigation";
import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { PreviewProvider } from "../preview/preview-state";
import { useQuiet } from "../theme";
import { SessionProvider } from "../session/provider";

export default function RootLayout() {
  const dark = useColorScheme() === "dark";
  const colors = useQuiet();
  return (
    <ThemeProvider value={dark ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <PreviewProvider>
          <StatusBar style="auto" />
          <Stack
            screenOptions={{
              headerStyle: { backgroundColor: colors.background },
              headerTintColor: colors.text,
              contentStyle: { backgroundColor: colors.background },
            }}
          >
            <Stack.Screen name="index" options={{ title: "Nest" }} />
            <Stack.Protected guard={__DEV__}>
              <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
              <Stack.Screen name="groceries" options={{ title: "Groceries" }} />
              <Stack.Screen name="preview-settings" options={{ title: "Preview settings" }} />
            </Stack.Protected>
          </Stack>
        </PreviewProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

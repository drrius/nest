import { OfflineProvider } from "../offline/provider";
import { ThemeProvider, DarkTheme, DefaultTheme } from "expo-router/react-navigation";
import { Stack } from "expo-router/stack";
import { StatusBar } from "expo-status-bar";
import { useColorScheme } from "react-native";
import { PreviewProvider } from "../preview/preview-state";
import { useQuiet } from "../theme";
import { SessionProvider, useSession } from "../session/provider";

export default function RootLayout() {
  const dark = useColorScheme() === "dark";
  return (
    <ThemeProvider value={dark ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <OfflineProvider>
          <PreviewProvider>
            <StatusBar style="auto" />
            <Navigation />
          </PreviewProvider>
        </OfflineProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}

function Navigation() {
  const colors = useQuiet();
  const { state } = useSession();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.text,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      <Stack.Screen name="index" options={{ title: "Nest" }} />
      <Stack.Protected
        guard={
          state.status === "ready" || state.status === "loading" || state.status === "unavailable"
        }
      >
        <Stack.Screen name="assistant" options={{ title: "Private assistant" }} />
        <Stack.Screen name="conversation" options={{ title: "Private conversation" }} />
        <Stack.Screen name="household" options={{ title: "Today" }} />
        <Stack.Screen name="checklist" options={{ title: "Groceries" }} />
        <Stack.Screen name="grocery-edit" options={{ title: "Grocery" }} />
        <Stack.Screen name="food-preferences" options={{ title: "Food preferences" }} />
      </Stack.Protected>
      <Stack.Protected guard={__DEV__}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="groceries" options={{ title: "Groceries" }} />
        <Stack.Screen name="preview-settings" options={{ title: "Preview settings" }} />
      </Stack.Protected>
    </Stack>
  );
}

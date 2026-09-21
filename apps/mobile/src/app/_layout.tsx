import { CalendarSharingProvider } from "../calendar/provider";
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
          <CalendarSharingProvider>
            <PreviewProvider>
              <StatusBar style="auto" />
              <Navigation />
            </PreviewProvider>
          </CalendarSharingProvider>
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
        <Stack.Screen name="chore-transfers" options={{ title: "Chore handovers" }} />
        <Stack.Screen name="routines" options={{ title: "Routines" }} />
        <Stack.Screen name="meal-library" options={{ title: "Saved recipes" }} />
        <Stack.Screen name="recipe-edit" options={{ title: "Edit recipe" }} />
        <Stack.Screen name="recipe-archive" options={{ title: "Archive recipe" }} />
        <Stack.Screen name="recipe-create" options={{ title: "New recipe" }} />
        <Stack.Screen name="recipe-select" options={{ title: "Choose recipe" }} />
        <Stack.Screen name="planned-recipe" options={{ title: "Planned meal" }} />
        <Stack.Screen name="saved-meal" options={{ title: "Recipe" }} />
        <Stack.Screen name="meal-week" options={{ title: "Meals" }} />
        <Stack.Screen name="meal-proposal" options={{ title: "Week preview" }} />
        <Stack.Screen name="meal-ingredients" options={{ title: "Review ingredients" }} />
        <Stack.Screen name="meal-add" options={{ title: "Add meal" }} />
        <Stack.Screen name="meal-replace" options={{ title: "Replace meal" }} />
        <Stack.Screen name="meal-preparation-edit" options={{ title: "Edit preparation" }} />
        <Stack.Screen name="meal-preparation" options={{ title: "Meal preparation" }} />
        <Stack.Screen name="meal-leftovers" options={{ title: "Plan leftovers" }} />
        <Stack.Screen name="meal-move" options={{ title: "Move meal" }} />
        <Stack.Screen name="meal-remove" options={{ title: "Remove meal" }} />
        <Stack.Screen name="checklist" options={{ title: "Groceries" }} />
        <Stack.Screen name="grocery-edit" options={{ title: "Grocery" }} />
        <Stack.Screen name="food-preferences" options={{ title: "Food preferences" }} />
        <Stack.Screen name="notification-preferences" options={{ title: "Your notifications" }} />
        <Stack.Screen name="cooking-preferences" options={{ title: "Household cooking" }} />
        <Stack.Screen name="calendar-sharing" options={{ title: "Calendar sharing" }} />
        <Stack.Screen name="memory" options={{ title: "Private memory" }} />
        <Stack.Screen name="setup" options={{ title: "Your setup" }} />
        <Stack.Screen name="settings" options={{ title: "Profile and settings" }} />
      </Stack.Protected>
      <Stack.Protected guard={__DEV__}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="groceries" options={{ title: "Groceries" }} />
        <Stack.Screen name="preview-settings" options={{ title: "Preview settings" }} />
      </Stack.Protected>
    </Stack>
  );
}

import { useColorScheme } from "react-native";

export const quiet = {
  background: "#F8F9F3",
  surface: "#FFFFFF",
  text: "#273A31",
  muted: "#717B73",
  accent: "#335D49",
  soft: "#EAF0E6",
  danger: "#9F3838",
  border: "#DDE3D8",
} as const;

const dark = {
  background: "#151E19",
  surface: "#202D25",
  text: "#EEF2E9",
  muted: "#B1BEB2",
  accent: "#B4D3AF",
  soft: "#304235",
  danger: "#F3AAA1",
  border: "#405346",
} as const;

export const space = { small: 8, medium: 16, large: 24, section: 32 } as const;

export function useQuiet() {
  return useColorScheme() === "dark" ? dark : quiet;
}

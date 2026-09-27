import { useColorScheme } from "react-native";

export const quiet = {
  background: "#FAFBF7",
  surface: "#FFFFFF",
  onAccent: "#FAFBF7",
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
  onAccent: "#151E19",
  text: "#EEF2E9",
  muted: "#B1BEB2",
  accent: "#B4D3AF",
  soft: "#304235",
  danger: "#F3AAA1",
  border: "#405346",
} as const;

export const space = { small: 8, medium: 16, large: 24, section: 32 } as const;

export const radius = { control: 12, surface: 20 } as const;
export const type = {
  display: { fontSize: 34, fontWeight: "600", letterSpacing: -1, lineHeight: 40 },
  title: { fontSize: 22, fontWeight: "600", letterSpacing: -0.4 },
  section: { fontSize: 17, fontWeight: "600", letterSpacing: -0.2 },
  body: { fontSize: 17, lineHeight: 25 },
  detail: { fontSize: 15, lineHeight: 22 },
  action: { fontSize: 17, fontWeight: "500", lineHeight: 23 },
} as const;

export function useQuiet() {
  return useColorScheme() === "dark" ? dark : quiet;
}

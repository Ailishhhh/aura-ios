// Aura's look: the Android app's warm night palette (ui/theme/Theme.kt) and Instrument Serif for
// display type, with the iPhone's own San Francisco for everything you read at small sizes.

import { PixelRatio, Platform, TextStyle } from "react-native";

export const theme = {
  night: "#0F0E0C",
  ink: "#171513",
  raised: "#201D1A",
  lifted: "#2A2622",
  cream: "#ECE4D6",
  muted: "#A39B8E",
  faint: "#6B655C",
  hairline: "rgba(236, 228, 214, 0.09)",
  veil: "rgba(15, 14, 12, 0.55)",
  ditherShadow: "#1A1816",
  ditherLight: "#DDD3C2",
  heart: "#E8806F",
} as const;

export const serif = "Serif";
export const serifItalic = "SerifItalic";

/** The type scale, from Theme.kt; body styles use the system font. */
export const type = {
  wordmark: { fontFamily: serif, fontSize: 84, lineHeight: 84, letterSpacing: -1.5, color: theme.cream },
  display: { fontFamily: serif, fontSize: 44, lineHeight: 48, letterSpacing: -0.4, color: theme.cream },
  title: { fontFamily: serif, fontSize: 34, lineHeight: 38, letterSpacing: -0.2, color: theme.cream },
  section: { fontFamily: serif, fontSize: 24, lineHeight: 28, color: theme.cream },
  itemTitle: { fontFamily: serif, fontSize: 17, lineHeight: 21, color: theme.cream },
  tagline: { fontFamily: serifItalic, fontSize: 22, lineHeight: 28, color: theme.muted },
  body: { fontSize: 15, lineHeight: 20, fontWeight: "500", color: theme.cream },
  row: { fontSize: 16, lineHeight: 21, fontWeight: "500", color: theme.cream },
  caption: { fontSize: 13, lineHeight: 17, fontWeight: "500", color: theme.muted },
  fine: { fontSize: 12, lineHeight: 16, fontWeight: "500", color: theme.faint },
  eyebrow: { fontSize: 11, lineHeight: 14, fontWeight: "600", letterSpacing: 2.2, color: theme.faint, textTransform: "uppercase" },
  button: { fontSize: 15, lineHeight: 20, fontWeight: "600", color: theme.cream },
} satisfies Record<string, TextStyle>;

export const space = { xs: 4, s: 8, m: 12, l: 16, xl: 20, xxl: 28, page: 20 } as const;
export const radius = { s: 6, m: 10, l: 16, xl: 24, pill: 999 } as const;

/** Grain cells in device pixels (Dither.kt), turned into points for this screen. */
export function grainPoints(grain: "fine" | "medium" | "coarse"): number {
  const px = grain === "fine" ? 2 : grain === "medium" ? 3 : 4.5;
  return px / PixelRatio.get();
}

export const isIOS26 = Platform.OS === "ios" && Number.parseInt(String(Platform.Version), 10) >= 26;

export const springs = {
  /** Critically damped, for things that move a long way. */
  page: { damping: 30, stiffness: 300, mass: 1 },
  /** A little bounce, for things you press. */
  press: { damping: 15, stiffness: 400, mass: 0.6 },
  soft: { damping: 22, stiffness: 180, mass: 1 },
} as const;

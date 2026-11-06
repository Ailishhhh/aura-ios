// The real moon tonight, and a greeting for the hour (web/src/lib/util.ts, profile/TonightMoon.kt).

const SYNODIC = 29.530588853;
const NEW_MOON = 947182440000; // 6 January 2000, 18:14 UTC

/** How far through its cycle the moon is: 0 new, 0.5 full. */
export function moonAge(time = Date.now()): number {
  return ((((time - NEW_MOON) / 86400000 / SYNODIC) % 1) + 1) % 1;
}

export const moonLit = (age: number) => (1 - Math.cos(2 * Math.PI * age)) / 2;

export const moonName = (age: number) =>
  ["New moon", "Waxing crescent", "First quarter", "Waxing gibbous", "Full moon", "Waning gibbous", "Last quarter", "Waning crescent"][Math.floor(age * 8 + 0.5) % 8];

/** The SF Symbol closest to tonight's moon. */
export function moonSymbol(age: number) {
  const names = ["moonphase.new.moon", "moonphase.waxing.crescent", "moonphase.first.quarter", "moonphase.waxing.gibbous", "moonphase.full.moon", "moonphase.waning.gibbous", "moonphase.last.quarter", "moonphase.waning.crescent"] as const;
  return names[Math.floor(age * 8 + 0.5) % 8];
}

export function greeting(date = new Date()): string {
  const hour = date.getHours();
  if (hour >= 5 && hour <= 11) return "Good Morning";
  if (hour >= 12 && hour <= 16) return "Good Afternoon";
  if (hour >= 17 && hour <= 21) return "Good Evening";
  return "Still Up";
}

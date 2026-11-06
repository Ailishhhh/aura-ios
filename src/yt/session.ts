// The signed-in YouTube Music session: the cookies Google set in the sign-in page, and the two
// identifiers YouTube Music's page config carries. Kept in the keychain, never logged.
// Mirrors the Android app's auth/AuthManager.kt.

import * as SecureStore from "expo-secure-store";
import { useSyncExternalStore } from "react";

import { Value } from "../lib/store";

export type Account = { name: string | null; email: string | null; handle: string | null; photo: string | null };
export type Session = { cookie: string; visitorData: string | null; dataSyncId: string | null; account: Account | null };

const KEY = "aura.session";
const SIGNED_IN_COOKIES = new Set(["SAPISID", "__Secure-3PAPISID"]);

function load(): Session | null {
  try {
    const raw = SecureStore.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export const session = new Value<Session | null>(load());

session.on((value) => {
  try {
    if (value) SecureStore.setItem(KEY, JSON.stringify(value));
    else void SecureStore.deleteItemAsync(KEY);
  } catch {
    // The session lasts until the app closes.
  }
});

export const isSignedInCookie = (cookie: string) => cookie.split(";").some((part) => SIGNED_IN_COOKIES.has(part.trim().split("=")[0]));

/** One cookie's value, e.g. SAPISID for signing requests. */
export function cookieValue(cookie: string, name: string): string | null {
  for (const part of cookie.split(";")) {
    const at = part.indexOf("=");
    if (at > 0 && part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return null;
}

export function useSession(): Session | null {
  return useSyncExternalStore(
    (fn) => session.on(fn),
    () => session.get(),
  );
}

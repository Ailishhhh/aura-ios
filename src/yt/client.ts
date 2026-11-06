// A small InnerTube client for YouTube Music, ported from the web player's site/api/_yt/client.js.
// The web player needs a server in between because browsers block these requests (no CORS);
// a native app asks YouTube Music directly, and can sign requests in as the user, which the
// browser can't.

import * as Crypto from "expo-crypto";

import { cookieValue, session } from "./session";

const ORIGIN = "https://music.youtube.com";
const BASE = `${ORIGIN}/youtubei/v1/`;

type Client = {
  clientName: string;
  clientVersion: string;
  userAgent?: string;
  [field: string]: string | number | undefined;
};

/** The web client YouTube Music's own site uses. */
export const WEB_REMIX: Client = {
  clientName: "WEB_REMIX",
  clientVersion: "1.20251027.01.00",
};

/** The Android app, for timed lyrics only; the same version the Android app pins. */
export const ANDROID_MUSIC: Client = {
  clientName: "ANDROID_MUSIC",
  clientVersion: "8.10.52",
  androidSdkVersion: 34,
  osName: "Android",
  osVersion: "14",
  userAgent: "com.google.android.apps.youtube.music/8.10.52 (Linux; U; Android 14) gzip",
};

const SAFARI = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1";

export class YouTubeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Options = { client?: Client; hl?: string; gl?: string; timeout?: number; anonymous?: boolean };

/** What YouTube's own web player sends to prove a request comes from the signed-in user. */
async function sapisidHash(cookie: string): Promise<string | null> {
  const sapisid = cookieValue(cookie, "SAPISID") ?? cookieValue(cookie, "__Secure-3PAPISID");
  if (!sapisid) return null;
  const ts = Math.floor(Date.now() / 1000);
  const hash = await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA1, `${ts} ${sapisid} ${ORIGIN}`);
  return `SAPISIDHASH ${ts}_${hash}`;
}

/** Posts [body] to an InnerTube [endpoint] ("browse", "search", "next"…) and returns the JSON. */
export async function innertube(endpoint: string, body: Record<string, unknown>, options: Options = {}): Promise<any> {
  const { client = WEB_REMIX, hl = "en", gl = "US", timeout = 12000, anonymous = false } = options;
  const { userAgent, ...fields } = client;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: ORIGIN,
    referer: `${ORIGIN}/`,
    "x-origin": ORIGIN,
    "user-agent": userAgent ?? SAFARI,
  };
  const context: Record<string, unknown> = { client: { ...fields, hl, gl } };

  const signedIn = !anonymous && client === WEB_REMIX ? session.get() : null;
  if (signedIn) {
    headers.cookie = signedIn.cookie;
    const auth = await sapisidHash(signedIn.cookie);
    if (auth) headers.authorization = auth;
    headers["x-goog-authuser"] = "0";
    if (signedIn.visitorData) {
      headers["x-goog-visitor-id"] = signedIn.visitorData;
      (context.client as Record<string, unknown>).visitorData = signedIn.visitorData;
    }
    if (signedIn.dataSyncId) context.user = { onBehalfOfUser: signedIn.dataSyncId };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${BASE}${endpoint}?prettyPrint=false`, {
      method: "POST",
      headers,
      body: JSON.stringify({ context, ...body }),
      signal: controller.signal,
      credentials: "omit",
    });
    if (!response.ok) throw new YouTubeError(`YouTube Music answered ${response.status}`, response.status);
    return await response.json();
  } catch (error) {
    if ((error as Error).name === "AbortError") throw new YouTubeError("YouTube Music took too long to answer", 504);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

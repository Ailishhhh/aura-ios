// A small InnerTube client for YouTube Music, ported from the web player's site/api/_yt/client.js.
// The web player needs a server in between because browsers block these requests (no CORS);
// a native app can ask YouTube Music directly.

const BASE = "https://music.youtube.com/youtubei/v1/";

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

export class YouTubeError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

type Options = { client?: Client; hl?: string; gl?: string; timeout?: number };

/** Posts [body] to an InnerTube [endpoint] ("browse", "search", "next"…) and returns the JSON. */
export async function innertube(endpoint: string, body: Record<string, unknown>, options: Options = {}): Promise<any> {
  const { client = WEB_REMIX, hl = "en", gl = "US", timeout = 12000 } = options;
  const { userAgent, ...fields } = client;
  const headers: Record<string, string> = {
    "content-type": "application/json",
    origin: "https://music.youtube.com",
    referer: "https://music.youtube.com/",
  };
  if (userAgent) headers["user-agent"] = userAgent;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`${BASE}${endpoint}?prettyPrint=false`, {
      method: "POST",
      headers,
      body: JSON.stringify({ context: { client: { ...fields, hl, gl } }, ...body }),
      signal: controller.signal,
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

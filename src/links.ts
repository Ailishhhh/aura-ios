// Links that open Aura. iOS won't let an app claim music.youtube.com links (that needs Google's
// permission on their domain), so they arrive other ways, all ending here:
//   aura://open?url=<music.youtube.com link>   from the share sheet, tryaura.today or Shortcuts
//   aura://watch?v=…, aura://playlist?list=…   the same paths as YouTube Music, on Aura's scheme
//   a link pasted into search
// Mirrors the Android app's ui/DeepLinks.kt. Parsed by hand: React Native's URL class leaves
// hostname and searchParams unimplemented.

export type DeepLink =
  | { kind: "song"; videoId: string; playlistId: string | null }
  | { kind: "playlist"; id: string }
  | { kind: "album"; browseId: string }
  | { kind: "artist"; browseId: string };

const YOUTUBE_HOSTS = new Set(["music.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"]);

type Parts = { scheme: string; host: string; segments: string[]; query: Map<string, string> };

function decode(value: string): string {
  try {
    return decodeURIComponent(value.replace(/\+/g, " "));
  } catch {
    return value;
  }
}

/** scheme://host/path?query#fragment, split into parts. */
export function splitUrl(text: string): Parts | null {
  const match = /^([a-z][a-z0-9+.-]*):\/\/([^/?#]*)([^?#]*)(?:\?([^#]*))?/i.exec(text.trim());
  if (!match) return null;
  const [, scheme, authority, path, search] = match;
  const query = new Map<string, string>();
  for (const pair of (search ?? "").split("&")) {
    if (!pair) continue;
    const at = pair.indexOf("=");
    const key = decode(at < 0 ? pair : pair.slice(0, at));
    if (!query.has(key)) query.set(key, at < 0 ? "" : decode(pair.slice(at + 1)));
  }
  return {
    scheme: scheme.toLowerCase(),
    host: authority.replace(/^.*@/, "").replace(/:\d+$/, "").toLowerCase(),
    segments: path.split("/").filter(Boolean).map(decode),
    query,
  };
}

/** What [text] points at, if it's a link Aura can open. */
export function parseLink(text: string | null | undefined): DeepLink | null {
  if (!text) return null;
  const url = splitUrl(text);
  if (!url) return null;

  if (url.scheme === "aura") {
    const wrapped = url.query.get("url");
    if (wrapped) return parseLink(wrapped);
    // In aura://watch?v=… the first path word sits where a host would.
    return fromPath([url.host, ...url.segments], url.query);
  }

  if (url.scheme !== "https" && url.scheme !== "http") return null;
  const host = url.host.replace(/^www\./, "");
  if (!YOUTUBE_HOSTS.has(host)) return null;
  if (host === "youtu.be") {
    const id = url.segments[0];
    return id ? { kind: "song", videoId: id, playlistId: url.query.get("list") || null } : null;
  }
  return fromPath(url.segments, url.query);
}

function fromPath(segments: string[], query: Map<string, string>): DeepLink | null {
  const list = query.get("list") || null;
  const [first, second] = segments;
  switch (first) {
    case "watch": {
      const v = query.get("v");
      if (v) return { kind: "song", videoId: v, playlistId: list };
      return list ? { kind: "playlist", id: list } : null;
    }
    case "playlist":
      return list ? { kind: "playlist", id: list } : null;
    case "channel":
      return second ? { kind: "artist", browseId: second } : null;
    case "browse":
      if (!second) return null;
      if (second.startsWith("MPRE")) return { kind: "album", browseId: second };
      if (second.startsWith("VL")) return { kind: "playlist", id: second.slice(2) };
      if (second.startsWith("UC")) return { kind: "artist", browseId: second };
      return null;
    default:
      return null;
  }
}

/** The first openable link in shared text, which often comes wrapped in a sentence. */
export function findLink(text: string | null | undefined): DeepLink | null {
  for (const match of text?.match(/(https?|aura):\/\/\S+/gi) ?? []) {
    const link = parseLink(match);
    if (link) return link;
  }
  return null;
}

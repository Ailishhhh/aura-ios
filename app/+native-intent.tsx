// Every link the system hands Aura passes through here first, and becomes a screen:
//   aura://open?url=<music.youtube.com link>, aura://watch?v=…, aura://playlist?list=…,
//   and music.youtube.com / youtu.be links from the share sheet.

import { parseLink, splitUrl } from "../src/links";

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    const url = splitUrl(path);
    if (url?.scheme === "aura" && url.host === "smoke") {
      return `/smoke?v=${encodeURIComponent(url.query.get("v") ?? "")}`;
    }
    const link = parseLink(path);
    if (!link) return path;
    switch (link.kind) {
      case "song":
        return `/listen?v=${encodeURIComponent(link.videoId)}${link.playlistId ? `&list=${encodeURIComponent(link.playlistId)}` : ""}`;
      case "playlist":
        return `/playlist/${encodeURIComponent(link.id)}`;
      case "album":
        return `/album/${encodeURIComponent(link.browseId)}`;
      case "artist":
        return `/artist/${encodeURIComponent(link.browseId)}`;
    }
  } catch {
    return "/";
  }
}

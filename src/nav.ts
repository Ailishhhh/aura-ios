// Opening things. Album, playlist and artist pages are shared by every tab, so each push names the
// tab it happens in; otherwise Expo Router would jump to the first tab that has the route.

import { router, useSegments } from "expo-router";
import { Share } from "react-native";

import { findPlaylist, toTrack } from "./lib/store";
import { queue } from "./player/queue";
import type { Item } from "./yt/types";

export type Tab = "(home)" | "(explore)" | "(library)" | "(search)";

export function useTab(): Tab {
  const segments = useSegments() as string[];
  const group = segments.find((s) => s === "(home)" || s === "(explore)" || s === "(library)" || s === "(search)");
  return (group as Tab) ?? "(home)";
}

type Page = "album" | "playlist" | "artist" | "category" | "browse" | "mine";

export function pagePath(tab: Tab, page: Page, id: string, params?: Record<string, string | undefined>) {
  return { pathname: `/(tabs)/${tab}/${page}/[id]` as const, params: { id, ...params } } as any;
}

/** Opens [item] where it belongs: a page for collections and artists, the player for songs. */
export function useOpen() {
  const tab = useTab();
  return (item: Item, context?: { list?: Item[]; source?: string }) => {
    switch (item.type) {
      case "album":
        router.push(pagePath(tab, "album", item.id));
        return;
      case "playlist":
      case "podcast":
        if (item.id.startsWith("aura-") && findPlaylist(item.id)) router.push(pagePath(tab, "mine", item.id));
        else router.push(pagePath(tab, "playlist", item.id));
        return;
      case "artist":
        router.push(pagePath(tab, "artist", item.id));
        return;
      default: {
        const list = context?.list?.filter((i) => i.type === "song" || i.type === "video" || i.type === "episode");
        if (list && list.length > 1) {
          const at = list.findIndex((i) => i.id === item.id);
          void queue.playTracks(list.map((i) => toTrack(i)), Math.max(0, at), { source: context?.source });
        } else {
          void queue.playSong(item);
        }
      }
    }
  };
}

export function openArtist(tab: Tab, id: string) {
  router.push(pagePath(tab, "artist", id));
}

export function openAlbum(tab: Tab, id: string) {
  router.push(pagePath(tab, "album", id));
}

/** A music.youtube.com link for [item], which opens in Aura on Android and in YouTube Music anywhere. */
export function linkFor(item: { type: Item["type"]; id: string }): string {
  switch (item.type) {
    case "album":
      return `https://music.youtube.com/browse/${item.id}`;
    case "playlist":
    case "podcast":
      return `https://music.youtube.com/playlist?list=${item.id.replace(/^VL/, "")}`;
    case "artist":
      return `https://music.youtube.com/channel/${item.id}`;
    default:
      return `https://music.youtube.com/watch?v=${item.id}`;
  }
}

export function share(item: { type: Item["type"]; id: string; title: string }) {
  void Share.share({ url: linkFor(item), message: item.title });
}

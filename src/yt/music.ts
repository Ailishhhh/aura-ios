// The calls the app makes to YouTube Music, ported from the web player's site/api/music.js handlers.
// Anonymous for now; signed-in calls move to the Kotlin backend with the rest of the library.

import { innertube } from "./client";
import * as parse from "./parse";

export type Artist = { name: string; id?: string | null };

/** One row or card, in the web player's flat shape (see parse.js). */
export type Item = {
  type: "song" | "video" | "album" | "playlist" | "artist" | "episode" | "podcast";
  id: string;
  title: string;
  subtitle?: string;
  artists?: Artist[];
  album?: { name: string; id?: string | null } | null;
  thumbnail?: string | null;
  duration?: number | null;
  playlistId?: string | null;
};

export type Section = { title: string; items: Item[]; top?: Item };

const FILTERS = {
  songs: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D",
  videos: "EgWKAQIQAWoKEAkQChAFEAMQBA%3D%3D",
  albums: "EgWKAQIYAWoKEAkQChAFEAMQBA%3D%3D",
  artists: "EgWKAQIgAWoKEAkQChAFEAMQBA%3D%3D",
  playlists: "EgeKAQQoADgBagwQDhAKEAMQBRAJEAQ%3D",
} as const;

export type SearchFilter = keyof typeof FILTERS;

export async function search(query: string, filter?: SearchFilter): Promise<{ sections: Section[]; continuation: string | null }> {
  const params = filter ? decodeURIComponent(FILTERS[filter]) : undefined;
  return parse.search(await innertube("search", { query, ...(params ? { params } : {}) })) as any;
}

export async function suggest(input: string): Promise<{ queries: string[]; items: Item[] }> {
  return parse.suggestions(await innertube("music/get_search_suggestions", { input })) as any;
}

export type NextPage = {
  title: string | null;
  tracks: Item[];
  continuation: string | null;
  lyricsId: string | null;
  relatedId: string | null;
};

/** The queue around a song: a radio, or a playlist starting at it. */
export async function next(args: { v?: string; list?: string; params?: string; token?: string }): Promise<NextPage> {
  const body: Record<string, unknown> = {};
  if (args.token) {
    body.continuation = args.token;
    if (args.list) body.playlistId = args.list;
  } else {
    if (args.v) body.videoId = args.v;
    if (args.list) body.playlistId = args.list;
    if (args.params) body.params = args.params;
    body.isAudioOnly = true;
    body.enablePersistentPlaylistPanel = true;
    body.tunerSettingValue = "AUTOMIX_SETTING_NORMAL";
  }
  return parse.next(await innertube("next", body)) as any;
}

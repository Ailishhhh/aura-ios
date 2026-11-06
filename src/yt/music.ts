// Every call the app makes to YouTube Music, ported from the web player's site/api/music.js.
// Answers are kept in memory for a while, and the same question asked twice at once is sent once
// (as web/src/lib/api.ts does).

import { ANDROID_MUSIC, innertube, YouTubeError } from "./client";
import * as parse from "./parse";
import type {
  AlbumPage,
  ArtistPage,
  Feed,
  Item,
  MoodGroup,
  NextPage,
  PlaylistPage,
  Section,
  YouTubeLyrics,
} from "./types";

export { YouTubeError };

const FILTERS = {
  songs: "EgWKAQIIAWoKEAkQBRAKEAMQBA%3D%3D",
  videos: "EgWKAQIQAWoKEAkQChAFEAMQBA%3D%3D",
  albums: "EgWKAQIYAWoKEAkQChAFEAMQBA%3D%3D",
  artists: "EgWKAQIgAWoKEAkQChAFEAMQBA%3D%3D",
  playlists: "EgeKAQQoADgBagwQDhAKEAMQBRAJEAQ%3D",
  community: "EgeKAQQoAEABagwQDhAKEAMQBRAJEAQ%3D",
} as const;

export type SearchFilter = keyof typeof FILTERS;

/** When YouTube won't list moods and genres for this visitor, these stand in. */
const FALLBACK_MOODS: MoodGroup[] = [
  {
    title: "Moods & moments",
    items: ["Chill", "Feel good", "Focus", "Energize", "Workout", "Party", "Romance", "Sad", "Sleep", "Commute", "Relax", "Late night"].map(
      (t) => ({ title: t, query: t }),
    ),
  },
  {
    title: "Genres",
    items: ["Pop", "Hip-hop", "R&B", "Rock", "Indie & alternative", "Dance & electronic", "Jazz", "Classical", "Soul", "Folk & acoustic", "Latin", "K-Pop"].map(
      (t) => ({ title: t, query: t }),
    ),
  },
];

const MINUTE = 60e3;
const memory = new Map<string, { at: number; data: unknown }>();
const inflight = new Map<string, Promise<unknown>>();

async function cached<T>(key: string, ttl: number, load: () => Promise<T>, fresh = false): Promise<T> {
  if (!fresh) {
    const hit = memory.get(key);
    if (hit && Date.now() - hit.at < ttl) return hit.data as T;
    const pending = inflight.get(key);
    if (pending) return pending as Promise<T>;
  }
  const request = load().then((data) => {
    memory.set(key, { at: Date.now(), data });
    if (memory.size > 300) memory.delete(memory.keys().next().value as string);
    return data;
  });
  inflight.set(key, request);
  try {
    return await request;
  } finally {
    inflight.delete(key);
  }
}

const stripVL = (id: string) => id.replace(/^VL/, "");

/** Forgets every answer, e.g. after signing in, when the feed is about to become yours. */
export function clearCache() {
  memory.clear();
}

export function home(params?: string | null, fresh = false): Promise<Feed> {
  return cached(
    `home:${params ?? ""}`,
    30 * MINUTE,
    async () => parse.feed(await innertube("browse", { browseId: "FEmusic_home", ...(params ? { params } : {}) })) as Feed,
    fresh,
  );
}

/** More shelves of a feed, or more rows of a list. */
export async function more(token: string): Promise<{ sections?: Section[]; songs?: Item[]; continuation: string | null }> {
  return parse.continuation(await innertube("browse", { continuation: token })) as any;
}

export function explore(): Promise<{ sections: Section[]; newReleases: Item[] }> {
  return cached("explore", 3 * 60 * MINUTE, async () => {
    const [page, releases] = await Promise.all([
      innertube("browse", { browseId: "FEmusic_explore" })
        .then((j) => parse.feed(j) as Feed)
        .catch(() => ({ sections: [] as Section[] })),
      innertube("browse", { browseId: "FEmusic_new_releases_albums" })
        .then((j) => parse.feed(j) as Feed)
        .catch(() => ({ sections: [] as Section[] })),
    ]);
    const albums = releases.sections.flatMap((s) => s.items).filter((i) => i.type === "album");
    return { sections: page.sections, newReleases: albums };
  });
}

export function moods(): Promise<{ groups: MoodGroup[]; fallback?: boolean }> {
  return cached("moods", 24 * 60 * MINUTE, async () => {
    try {
      const groups = parse.moods(await innertube("browse", { browseId: "FEmusic_moods_and_genres" })) as MoodGroup[];
      if (groups.length) return { groups };
    } catch {
      // Not offered to this visitor; the stand-ins will do.
    }
    return { groups: FALLBACK_MOODS, fallback: true };
  });
}

async function searchSection(query: string, filter: SearchFilter, title: string): Promise<Section | null> {
  try {
    const result = parse.search(await innertube("search", { query, params: decodeURIComponent(FILTERS[filter]) })) as { sections: Section[] };
    const items = result.sections.flatMap((s) => s.items);
    return items.length ? { title, items } : null;
  } catch {
    return null;
  }
}

/** A genre or mood: YouTube's own page when there is one, else one gathered by search. */
export function category(args: { id?: string; params?: string | null; q?: string }): Promise<Feed> {
  return cached(`category:${args.id ?? ""}:${args.params ?? ""}:${args.q ?? ""}`, 6 * 60 * MINUTE, async () => {
    if (args.id) {
      return parse.feed(await innertube("browse", { browseId: args.id, ...(args.params ? { params: args.params } : {}) })) as Feed;
    }
    const query = args.q ?? "";
    const sections = await Promise.all([
      searchSection(`${query} playlist`, "playlists", "Playlists for you"),
      searchSection(`${query} songs`, "songs", "Songs"),
      searchSection(`${query} music`, "community", "From listeners"),
      searchSection(`${query} music`, "albums", "Albums"),
      searchSection(`${query} music`, "artists", "Artists"),
    ]);
    return { title: query, chips: [], sections: sections.filter((s): s is Section => s != null), continuation: null };
  });
}

export type SearchResult = { sections: Section[]; continuation: string | null };

export function search(query: string, filter?: SearchFilter): Promise<SearchResult> {
  return cached(`search:${filter ?? ""}:${query}`, 10 * MINUTE, async () => {
    const params = filter ? decodeURIComponent(FILTERS[filter]) : undefined;
    return parse.search(await innertube("search", { query, ...(params ? { params } : {}) })) as SearchResult;
  });
}

export async function searchMore(token: string): Promise<SearchResult> {
  return parse.search(await innertube("search", { continuation: token })) as SearchResult;
}

export function suggest(input: string): Promise<{ queries: string[]; items: Item[] }> {
  return cached(`suggest:${input}`, 10 * MINUTE, async () => parse.suggestions(await innertube("music/get_search_suggestions", { input })) as any);
}

export function album(id: string): Promise<AlbumPage> {
  return cached(`album:${id}`, 24 * 60 * MINUTE, async () => parse.album(await innertube("browse", { browseId: id }), id) as AlbumPage);
}

export function playlist(id: string): Promise<PlaylistPage> {
  const bare = stripVL(id);
  return cached(`playlist:${bare}`, 30 * MINUTE, async () => parse.playlist(await innertube("browse", { browseId: `VL${bare}` }), bare) as PlaylistPage);
}

export async function playlistMore(token: string): Promise<{ songs: Item[]; continuation: string | null }> {
  const page = (await more(token)) as { songs?: Item[]; continuation: string | null };
  return { songs: page.songs ?? [], continuation: page.continuation };
}

export function artist(id: string): Promise<ArtistPage> {
  // The library lists artists as MPLA + channel; the channel alone is their full page.
  const channel = id.replace(/^MPLA/, "");
  return cached(`artist:${channel}`, 6 * 60 * MINUTE, async () => parse.artist(await innertube("browse", { browseId: channel }), channel) as ArtistPage);
}

/** Anything else with a browse id: an artist's "See all", a chart, a shelf's "More". */
export function browse(id: string, params?: string | null): Promise<Feed> {
  return cached(`browse:${id}:${params ?? ""}`, 3 * 60 * MINUTE, async () => {
    const json = await innertube("browse", { browseId: id, ...(params ? { params } : {}) });
    const page = parse.feed(json) as Feed;
    const header = json.header?.musicHeaderRenderer ?? json.header?.musicImmersiveHeaderRenderer ?? json.header?.musicResponsiveHeaderRenderer;
    return { ...page, title: page.title || parse.text(header?.title) || null };
  });
}

/** The queue around a song: a radio, or a playlist starting at it. */
export function next(args: { v?: string; list?: string; params?: string; token?: string }): Promise<NextPage> {
  return cached(`next:${args.v ?? ""}:${args.list ?? ""}:${args.params ?? ""}:${args.token ?? ""}`, 10 * MINUTE, async () => {
    const body: Record<string, unknown> = {};
    if (args.token) {
      body.continuation = args.token;
      if (args.list) body.playlistId = args.list;
    } else {
      if (args.v) body.videoId = args.v;
      if (args.list) body.playlistId = args.list;
      if (args.params) body.params = args.params;
      if (!args.v && !args.list) throw new YouTubeError("A song or playlist is needed", 400);
      body.isAudioOnly = true;
      body.enablePersistentPlaylistPanel = true;
      body.tunerSettingValue = "AUTOMIX_SETTING_NORMAL";
    }
    return parse.next(await innertube("next", body)) as NextPage;
  });
}

export function related(id: string): Promise<Feed> {
  return cached(`related:${id}`, 6 * 60 * MINUTE, async () => parse.feed(await innertube("browse", { browseId: id })) as Feed);
}

/** YouTube Music's own lyrics: timed lines when it has them, plain words otherwise. */
export function youtubeLyrics(videoId: string): Promise<YouTubeLyrics> {
  return cached(`lyrics:${videoId}`, 60 * MINUTE, async () => {
    const watch = parse.next(await innertube("next", { videoId, isAudioOnly: true })) as NextPage;
    if (!watch.lyricsId) return { timed: null, plain: null };
    const [timed, plain] = await Promise.all([
      innertube("browse", { browseId: watch.lyricsId }, { client: ANDROID_MUSIC })
        .then(parse.timedLyrics)
        .catch(() => null),
      innertube("browse", { browseId: watch.lyricsId })
        .then(parse.plainLyrics)
        .catch(() => null),
    ]);
    return { timed: timed?.length ? timed : null, plain } as YouTubeLyrics;
  });
}

/** A crisp size of a YouTube Music image (web/src/lib/api.ts sized). */
export function sized(url: string | null | undefined, px = 544): string | null {
  if (!url) return null;
  if (url.includes("googleusercontent.com") || url.includes("ggpht.com")) {
    return url.replace(/=w\d+-h\d+[^&?/]*/, `=w${px}-h${px}-l90-rj`).replace(/=s\d+[^&?/]*/, `=s${px}`);
  }
  if (url.includes("i.ytimg.com")) {
    return url.replace(/\/(default|mqdefault|sddefault|hq720|hqdefault)\.jpg.*$/, px > 400 ? "/hq720.jpg" : "/hqdefault.jpg");
  }
  return url;
}

// Everything Aura keeps on the phone: settings, the library (liked songs, saved albums and
// playlists, followed artists, playlists you make), what you've played, and searches.
// Ported from the web player's lib/store.ts, with SQLite in place of localStorage. The export
// format is the same, so a library moves between the web player and the iPhone as one file.

import Storage from "expo-sqlite/kv-store";
import { AppState } from "react-native";
import { useSyncExternalStore } from "react";

import type { Item } from "../yt/types";

const PREFIX = "aura.";

function read<T>(key: string, fallback: T): T {
  try {
    const raw = Storage.getItemSync(PREFIX + key);
    return raw == null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

const pending = new Map<string, unknown>();
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function write(key: string, value: unknown) {
  pending.set(key, value);
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 400);
}

export function flush() {
  for (const [key, value] of pending) {
    try {
      Storage.setItemSync(PREFIX + key, JSON.stringify(value));
    } catch {
      // Keeps working from memory.
    }
  }
  pending.clear();
}

AppState.addEventListener("change", (state) => {
  if (state !== "active") flush();
});

/** A value that tells its listeners when it changes. */
export class Value<T> {
  private listeners = new Set<(v: T) => void>();
  constructor(private value: T) {}
  get(): T {
    return this.value;
  }
  set(value: T) {
    if (Object.is(value, this.value)) return;
    this.value = value;
    for (const fn of [...this.listeners]) fn(value);
  }
  update(fn: (v: T) => T) {
    this.set(fn(this.value));
  }
  /** Calls [fn] on every change; returns the way to stop. */
  on(fn: (v: T) => void): () => void {
    this.listeners.add(fn);
    return () => {
      this.listeners.delete(fn);
    };
  }
}

/** A [Value] kept on disk under [key]. */
export function persisted<T>(key: string, fallback: T): Value<T> {
  const v = new Value<T>(read(key, fallback));
  v.on((value) => write(key, value));
  return v;
}

/** Re-renders when [select] of [value] changes. Select primitives or stable objects. */
export function useValue<T, S = T>(value: Value<T>, select?: (v: T) => S): S {
  const pick = select ?? ((v: T) => v as unknown as S);
  return useSyncExternalStore(
    (fn) => value.on(fn),
    () => pick(value.get()),
  );
}

// ---------- settings ----------

export type DitherStyle = "noise" | "bayer" | "halftone" | "lines";
export type Grain = "fine" | "medium" | "coarse";

export const DEFAULT_SETTINGS = {
  dither: true,
  style: "bayer" as DitherStyle,
  grain: "fine" as Grain,
  originalColors: false,
  evenVolume: true,
  haptics: true,
  quality: "high" as "high" | "low",
  name: "",
};

export type Settings = typeof DEFAULT_SETTINGS;

export const settings = persisted<Settings>("settings", DEFAULT_SETTINGS);
settings.set({ ...DEFAULT_SETTINGS, ...settings.get() });

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  settings.set({ ...settings.get(), [key]: value });
}

// ---------- tracks ----------

export type Track = {
  id: string;
  type: "song" | "video" | "episode";
  title: string;
  artists: { name: string; id?: string | null }[];
  album: { name: string; id?: string | null } | null;
  thumbnail: string | null;
  duration: number | null;
};

/** The parts of a song worth keeping. */
export function toTrack(item: Partial<Item> & { id: string; title?: string }): Track {
  return {
    id: item.id,
    type: item.type === "video" ? "video" : item.type === "episode" ? "episode" : "song",
    title: item.title ?? "",
    artists: (item.artists ?? []).map((a) => ({ name: a.name, id: a.id ?? null })),
    album: item.album ? { name: item.album.name, id: item.album.id ?? null } : null,
    thumbnail: item.thumbnail ?? null,
    duration: item.duration ?? null,
  };
}

export const artistLine = (track: { artists?: { name: string }[]; subtitle?: string }) =>
  track.artists?.length ? track.artists.map((a) => a.name).join(", ") : (track.subtitle ?? "");

// ---------- library ----------

export type Liked = Track & { at: number };
export type SavedItem = {
  type: Item["type"];
  id: string;
  title: string;
  subtitle: string | null;
  artists: Item["artists"] | null;
  author: string | null;
  year: string | null;
  kind: string | null;
  thumbnail: string | null;
  playlistId: string | null;
  at: number;
};
export type Followed = { id: string; title: string; thumbnail: string | null; at: number };
export type LocalPlaylist = { id: string; title: string; description: string; tracks: Track[]; created: number; updated: number };

export const likes = persisted<Liked[]>("likes", []);
export const saved = persisted<SavedItem[]>("saved", []);
export const following = persisted<Followed[]>("following", []);
export const playlists = persisted<LocalPlaylist[]>("playlists", []);

export const isLiked = (id: string) => likes.get().some((t) => t.id === id);
export const useLiked = (id: string | undefined) => useValue(likes, (l) => (id ? l.some((t) => t.id === id) : false));

export function toggleLike(item: Partial<Item> & { id: string }, force?: boolean): boolean {
  const liked = isLiked(item.id);
  const want = force ?? !liked;
  if (want === liked) return want;
  if (want) likes.set([{ ...toTrack(item), at: Date.now() }, ...likes.get()]);
  else likes.set(likes.get().filter((t) => t.id !== item.id));
  return want;
}

export const isSaved = (id: string) => saved.get().some((s) => s.id === id);
export const useSaved = (id: string | undefined) => useValue(saved, (l) => (id ? l.some((s) => s.id === id) : false));

export function toggleSaved(item: Partial<Item> & { id: string; type: Item["type"]; title: string }, force?: boolean): boolean {
  const has = isSaved(item.id);
  const want = force ?? !has;
  if (want === has) return want;
  if (want) {
    const keep: SavedItem = {
      type: item.type,
      id: item.id,
      title: item.title,
      subtitle: item.subtitle ?? null,
      artists: item.artists ?? null,
      author: item.author ?? null,
      year: item.year ?? null,
      kind: item.kind ?? null,
      thumbnail: item.thumbnail ?? null,
      playlistId: item.playlistId ?? null,
      at: Date.now(),
    };
    saved.set([keep, ...saved.get()]);
  } else saved.set(saved.get().filter((s) => s.id !== item.id));
  return want;
}

export const isFollowing = (id: string) => following.get().some((a) => a.id === id);
export const useFollowing = (id: string | undefined) => useValue(following, (l) => (id ? l.some((a) => a.id === id) : false));

export function toggleFollow(artist: { id: string; title: string; thumbnail?: string | null }, force?: boolean): boolean {
  const has = isFollowing(artist.id);
  const want = force ?? !has;
  if (want === has) return want;
  if (want) following.set([{ id: artist.id, title: artist.title, thumbnail: artist.thumbnail ?? null, at: Date.now() }, ...following.get()]);
  else following.set(following.get().filter((a) => a.id !== artist.id));
  return want;
}

export function createPlaylist(title: string, tracks: Track[] = []): LocalPlaylist {
  const now = Date.now();
  const list: LocalPlaylist = {
    id: `aura-${now.toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    title: title.trim() || "New playlist",
    description: "",
    tracks,
    created: now,
    updated: now,
  };
  playlists.set([list, ...playlists.get()]);
  return list;
}

export const findPlaylist = (id: string) => playlists.get().find((p) => p.id === id);

export function updatePlaylist(id: string, change: (p: LocalPlaylist) => Partial<LocalPlaylist>) {
  playlists.set(playlists.get().map((p) => (p.id === id ? { ...p, ...change(p), updated: Date.now() } : p)));
}

export function addToPlaylist(id: string, tracks: Track[]): number {
  let added = 0;
  updatePlaylist(id, (p) => {
    const have = new Set(p.tracks.map((t) => t.id));
    const fresh = tracks.filter((t) => !have.has(t.id));
    added = fresh.length;
    return { tracks: [...p.tracks, ...fresh] };
  });
  return added;
}

export function deletePlaylist(id: string) {
  playlists.set(playlists.get().filter((p) => p.id !== id));
}

// ---------- listening ----------

export type Play = { track: Track; at: number };

/** Every play, newest first. A play counts after half a minute or half the song. */
export const history = persisted<Play[]>("history", []);
const HISTORY_LIMIT = 4000;

export function recordPlay(track: Track) {
  history.set([{ track, at: Date.now() }, ...history.get()].slice(0, HISTORY_LIMIT));
}

export function clearHistory() {
  history.set([]);
}

/** Songs in the order last played, each once. */
export function recentTracks(list: Play[], limit = 50): Track[] {
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const { track } of list) {
    if (seen.has(track.id)) continue;
    seen.add(track.id);
    out.push(track);
    if (out.length >= limit) break;
  }
  return out;
}

/** How often each song has played, most played first. */
export function playCounts(list: Play[]): { track: Track; count: number; last: number }[] {
  const counts = new Map<string, { track: Track; count: number; last: number }>();
  for (const { track, at } of list) {
    const entry = counts.get(track.id);
    if (entry) entry.count++;
    else counts.set(track.id, { track, count: 1, last: at });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || b.last - a.last);
}

/** The artists played most since [since]. */
export function topArtists(list: Play[], since = 0, limit = 8): { name: string; id?: string | null; count: number }[] {
  const counts = new Map<string, { name: string; id?: string | null; count: number }>();
  for (const { track, at } of list) {
    if (at < since) break;
    const artist = track.artists?.[0];
    if (!artist?.name) continue;
    const key = artist.id ?? artist.name;
    const entry = counts.get(key) ?? { name: artist.name, id: artist.id, count: 0 };
    entry.count++;
    counts.set(key, entry);
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, limit);
}

// ---------- search ----------

export const searches = persisted<string[]>("searches", []);

export function rememberSearch(query: string) {
  const q = query.trim();
  if (!q) return;
  searches.set([q, ...searches.get().filter((s) => s.toLowerCase() !== q.toLowerCase())].slice(0, 20));
}

export function forgetSearch(query: string) {
  searches.set(searches.get().filter((s) => s !== query));
}

// ---------- onboarding ----------

export const welcome = persisted<{ seen: boolean; seeds: { id: string; title: string }[] }>("welcome", { seen: false, seeds: [] });

// ---------- moving between devices ----------

const KEPT = { settings, likes, saved, following, playlists, history, searches, welcome } as const;

export function exportLibrary(): Record<string, unknown> {
  const data: Record<string, unknown> = { app: "aura", version: 1, exported: new Date().toISOString() };
  for (const [key, value] of Object.entries(KEPT)) data[key] = (value as Value<unknown>).get();
  return data;
}

/** Merges an export into what's here: nothing already here is lost. */
export function importLibrary(data: any) {
  if (!data || data.app !== "aura") throw new Error("That file isn't an Aura library.");
  const mergeById = <T extends { id: string }>(mine: T[], theirs: T[] | undefined): T[] => {
    const ids = new Set(mine.map((x) => x.id));
    return [...mine, ...(theirs ?? []).filter((x) => x && x.id && !ids.has(x.id))];
  };
  likes.set(mergeById(likes.get(), data.likes).sort((a, b) => (b.at ?? 0) - (a.at ?? 0)));
  saved.set(mergeById(saved.get(), data.saved));
  following.set(mergeById(following.get(), data.following));
  playlists.set(mergeById(playlists.get(), data.playlists));
  const seen = new Set(history.get().map((e) => `${e.track.id}@${e.at}`));
  history.set(
    [...history.get(), ...((data.history ?? []) as Play[]).filter((e) => e?.track?.id && !seen.has(`${e.track.id}@${e.at}`))]
      .sort((a, b) => b.at - a.at)
      .slice(0, HISTORY_LIMIT),
  );
  if (data.settings) settings.set({ ...settings.get(), ...data.settings });
  if (data.welcome?.seeds?.length) welcome.set({ seen: true, seeds: data.welcome.seeds });
}

// ---------- the queue, between launches ----------

export const savedQueue = {
  load: <T>() => read<T | null>("queue", null),
  save: (state: unknown) => write("queue", state),
};

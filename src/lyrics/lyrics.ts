// Lyrics, found as the Android app and web player find them (Lyrics.kt, LrcRed.kt, lyrics.ts):
// lrc.red first as long as it has timing, then YouTube Music's own timed lines, then plain words
// from either. A wrong song's words are worse than none, so matches are strict.

import { useSyncExternalStore } from "react";
import Storage from "expo-sqlite/kv-store";

import { Track, Value, artistLine } from "../lib/store";
import { queue } from "../player/queue";
import { youtubeLyrics } from "../yt/music";

export type LyricsDoc = { ttml: string; level: string; source: string; songwriters?: string[] };
export type LyricsState = { trackId: string | null; status: "idle" | "loading" | "ready" | "missing" | "failed"; doc: LyricsDoc | null };

const LRC = "https://lrc.red";
const MISSING_TTL = 3 * 24 * 3600e3;

export const lyrics = new Value<LyricsState>({ trackId: null, status: "idle", doc: null });

const cache = new Map<string, LyricsDoc | { missing: true }>();

function readKept(id: string): LyricsDoc | { missing: true } | null {
  try {
    const raw = Storage.getItemSync(`aura.lyrics.${id}`);
    if (!raw) return null;
    const kept = JSON.parse(raw);
    if (kept.missing && Date.now() - kept.at > MISSING_TTL) return null;
    return kept;
  } catch {
    return null;
  }
}

function keep(id: string, value: LyricsDoc | { missing: true }) {
  try {
    Storage.setItemSync(`aura.lyrics.${id}`, JSON.stringify({ ...value, at: Date.now() }));
  } catch {
    // Memory will do.
  }
}

// ---------- matching (LrcRed.kt) ----------

const VERSION_WORDS = /\b(remix|mix|mixed|live|acoustic|slowed|sped|reverb|nightcore|instrumental|karaoke|demo|unplugged|cover|extended|dub)\b/gi;

export const cleanTitle = (title: string) =>
  title
    .replace(/\s*[([][^)\]]*\b(official|video|audio|lyrics?|visuali[sz]er|mv|hd|4k|remaster(ed)?)\b[^)\]]*[)\]]/gi, "")
    .replace(/\s*\|.*$/, "")
    .trim();

const primaryArtist = (artist: string) => artist.split(/,|&| x | X /)[0].trim();
const versionTags = (title: string) => new Set([...title.matchAll(VERSION_WORDS)].map((m) => m[0].toLowerCase().replace("mixed", "mix")));
const sameSet = (a: Set<string>, b: Set<string>) => a.size === b.size && [...a].every((x) => b.has(x));
const normalize = (text: string) =>
  text
    .toLowerCase()
    .replace(/[([][^)\]]*[)\]]/g, " ")
    .replace(/\b(feat|ft|featuring)\b\.?.*$/, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "");

type Hit = { title?: string; artist?: string; duration?: number; isrc?: string };

function pick(hits: Hit[], title: string, artist: string, durationSec: number | null): Hit | null {
  const wantTitle = normalize(cleanTitle(title));
  const wantTags = versionTags(cleanTitle(title));
  const wantArtist = normalize(primaryArtist(artist));
  let best: Hit | null = null;
  let bestScore = -1;
  for (const hit of hits) {
    const gotTitle = normalize(hit.title ?? "");
    let titleScore = 0;
    if (gotTitle && wantTitle && sameSet(versionTags(hit.title ?? ""), wantTags)) {
      if (gotTitle === wantTitle) titleScore = 2;
      else if (gotTitle.includes(wantTitle) || wantTitle.includes(gotTitle)) titleScore = 1;
    }
    const gotArtist = normalize(primaryArtist(hit.artist ?? ""));
    const artistOk = !!gotArtist && !!wantArtist && (gotArtist.includes(wantArtist) || wantArtist.includes(gotArtist));
    let durationScore = 1;
    if (durationSec && hit.duration) {
      const d = Math.abs(hit.duration - durationSec);
      durationScore = d <= 3 ? 2 : d <= 8 ? 1 : 0;
    }
    if (titleScore > 0 && durationScore > 0 && (artistOk || durationScore === 2)) {
      const score = titleScore * 4 + (artistOk ? 2 : 0) + durationScore;
      if (score > bestScore) {
        best = hit;
        bestScore = score;
      }
    }
  }
  return best;
}

const query = (params: Record<string, string>) =>
  Object.entries(params)
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

async function getJson(url: string): Promise<any> {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`lrc.red answered ${response.status}`);
  return response.json();
}

async function fromLrcRed(track: Track, durationSec: number | null): Promise<LyricsDoc | null> {
  const title = cleanTitle(track.title);
  const artist = artistLine(track);
  const first = primaryArtist(artist);
  const match: Record<string, string> = { track: title, artist: first };
  if (durationSec) match.duration = String(Math.round(durationSec));
  const lookups = [`${LRC}/match.json?${query(match)}`, `${LRC}/search.json?${query({ q: `${title} ${first}` })}`, `${LRC}/search.json?${query({ q: title })}`];
  for (const url of lookups) {
    const json = await getJson(url);
    const hits = ((json?.hits ?? []) as Hit[]).filter((h) => h?.isrc);
    const hit = pick(hits, track.title, artist, durationSec);
    if (!hit) continue;
    const song = await getJson(`${LRC}/s/${encodeURIComponent(hit.isrc!)}.song.json`);
    if (!song?.source?.includes("<tt")) return null;
    return { ttml: song.source, level: String(song.level ?? "").toLowerCase(), source: "lrc.red", songwriters: song.songwriters ?? [] };
  }
  return null;
}

const NOT_LYRICS = /^[\s♪♫-]*(\[[^\]]*]|\([^)]*\))?[\s♪♫-]*$/;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const secs = (ms: number) => `${Math.floor(ms / 1000)}.${String(Math.round(ms % 1000)).padStart(3, "0")}`;
const ttmlDoc = (timing: string, divs: string[][]) =>
  `<tt xmlns="http://www.w3.org/ns/ttml" xmlns:lrc="http://lrc.red/lyric-ttml-internal" lrc:timing="${timing}"><body>${divs
    .map((ps) => `<div>${ps.join("")}</div>`)
    .join("")}</body></tt>`;

async function fromYouTube(track: Track): Promise<{ timed: LyricsDoc | null; plain: LyricsDoc | null }> {
  const found = await youtubeLyrics(track.id);
  let timed: LyricsDoc | null = null;
  if (found.timed?.length) {
    const lines = found.timed.filter((l) => l.text.trim() && !NOT_LYRICS.test(l.text));
    if (lines.length) {
      timed = {
        ttml: ttmlDoc("Line", [lines.map((l) => `<p begin="${secs(l.start)}" end="${secs(l.end > l.start ? l.end : l.start + 4000)}">${esc(l.text.trim())}</p>`)]),
        level: "line",
        source: "YouTube Music",
      };
    }
  }
  let plain: LyricsDoc | null = null;
  if (found.plain?.text) {
    const stanzas = found.plain.text
      .trim()
      .split("\n")
      .filter((l) => !l.trim().toLowerCase().startsWith("source:"))
      .join("\n")
      .split(/\n\s*\n/)
      .map((s) =>
        s
          .split("\n")
          .map((l) => l.trim())
          .filter(Boolean),
      )
      .filter((s) => s.length);
    if (stanzas.length) {
      plain = {
        ttml: ttmlDoc(
          "None",
          stanzas.map((s) => s.map((l) => `<p>${esc(l)}</p>`)),
        ),
        level: "none",
        source: found.plain.source?.replace(/^Source:\s*/i, "") || "YouTube Music",
      };
    }
  }
  return { timed, plain };
}

/** lrc.red first while it has timing; then YouTube's timed lines; untimed words last. */
async function choose(track: Track, durationSec: number | null): Promise<LyricsDoc | null> {
  const red = await fromLrcRed(track, durationSec).then(
    (v) => ({ v, e: null }),
    (e) => ({ v: null, e }),
  );
  if (red.v && (red.v.level === "word" || red.v.level === "line" || red.v.level === "syllable")) return red.v;
  const yt = await fromYouTube(track).then(
    (v) => ({ v, e: null }),
    (e) => ({ v: null, e }),
  );
  if (yt.v?.timed) return yt.v.timed;
  if (red.v) return red.v;
  if (yt.v?.plain) return yt.v.plain;
  if (red.e && yt.e) throw red.e;
  return null;
}

let job = 0;

async function load(track: Track | null, force = false) {
  const mine = ++job;
  if (!track) return lyrics.set({ trackId: null, status: "idle", doc: null });
  if (!force) {
    const hit = cache.get(track.id) ?? readKept(track.id);
    if (hit) {
      cache.set(track.id, hit);
      const missing = "missing" in hit;
      return lyrics.set({ trackId: track.id, status: missing ? "missing" : "ready", doc: missing ? null : (hit as LyricsDoc) });
    }
  }
  lyrics.set({ trackId: track.id, status: "loading", doc: null });
  // The length tells a song from its remix; wait a moment for the player's own figure.
  let duration = track.duration;
  for (let i = 0; i < 12 && !duration; i++) {
    await new Promise((r) => setTimeout(r, 250));
    duration = queue.snapshot().player.duration ?? null;
  }
  // The track may arrive without a title when opened from a link; wait for the radio to name it.
  let named = track;
  for (let i = 0; i < 12 && !named.title; i++) {
    await new Promise((r) => setTimeout(r, 250));
    named = queue.snapshot().current?.id === track.id ? (queue.snapshot().current ?? track) : track;
  }
  try {
    const doc = await choose(named, duration ?? null);
    if (mine !== job) return;
    const value = doc ?? ({ missing: true } as const);
    cache.set(track.id, value);
    keep(track.id, value);
    lyrics.set({ trackId: track.id, status: doc ? "ready" : "missing", doc });
  } catch {
    if (mine !== job) return;
    lyrics.set({ trackId: track.id, status: "failed", doc: null });
  }
}

export const retryLyrics = () => void load(queue.snapshot().current, true);

let lastId: string | null = null;
queue.subscribe(() => {
  const current = queue.snapshot().current;
  if ((current?.id ?? null) === lastId) return;
  lastId = current?.id ?? null;
  // Looked up as each song starts, so the Lyrics button already knows if there's anything.
  void load(current);
});

export function useLyrics(): LyricsState {
  return useSyncExternalStore(
    (fn) => lyrics.on(fn),
    () => lyrics.get(),
  );
}

// The play queue, kept in JavaScript like the web player's lib/player.ts, driving the native
// player. The native side only ever holds the current song and the next one; when the current
// song ends it moves on by itself (so it works with the screen locked) and tells us, and we queue
// the one after. Radios continue themselves, as in the Android app's playback/Playback.kt.

import { useSyncExternalStore } from "react";

import Aura, { NativeTrack, PlayerError, PlayerState, StreamInfo, resolveStream } from "../../modules/aura-native";
import { Track, artistLine, recordPlay, savedQueue, settings, toTrack } from "../lib/store";
import { next as fetchNext, sized } from "../yt/music";
import type { Item } from "../yt/types";

export type Repeat = "off" | "all" | "one";
export type Sleep = { kind: "at"; at: number; minutes: number } | { kind: "song" } | null;

export type QueueState = {
  tracks: Track[];
  index: number;
  current: Track | null;
  source: string | null;
  player: PlayerState;
  error: string | null;
  stream: StreamInfo | null;
  shuffle: boolean;
  repeat: Repeat;
  sleep: Sleep;
  /** True while a song is being found and loaded, before the native player has it. */
  preparing: boolean;
};

type Saved = {
  tracks: Track[];
  index: number;
  position: number;
  source: string | null;
  shuffle: boolean;
  repeat: Repeat;
  radio: Radio | null;
};

type Radio = { list: string; token: string | null };

const IDLE: PlayerState = { state: "idle", intendsToPlay: false, position: 0 };
const SLEEP_FADE_MS = 30_000;
const SONG_FADE_MS = 10_000;

function shuffled<T>(list: T[]): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

class Queue {
  private tracks: Track[] = [];
  private unshuffled: Track[] | null = null;
  private index = -1;
  private source: string | null = null;
  private radio: Radio | null = null;
  private loadingMore = false;
  private player: PlayerState = IDLE;
  private error: string | null = null;
  private preparing = false;
  private repeat: Repeat = "off";
  private sleep: Sleep = null;
  private sleepGain = 1;
  private loudnessGain = 1;
  private streams = new Map<string, { info: StreamInfo; validUntil: number }>();
  private retried = new Set<string>();
  /** Which song the native side holds as "next". */
  private queuedNext: string | null = null;
  private listeners = new Set<() => void>();
  private snap: QueueState;
  /** Bumped by every start, so slow answers for an old song are dropped. */
  private generation = 0;
  /** Seconds actually listened to the current song, and whether it has been counted. */
  private listened = 0;
  private lastPosition = 0;
  private counted = false;
  private sleepTimer: ReturnType<typeof setInterval> | null = null;
  private restored = false;

  constructor() {
    this.snap = this.build();
    Aura.addListener("onPlayerState", (state) => this.onState(state));
    Aura.addListener("onTrackChanged", ({ id }) => this.nativeAdvanced(id));
    Aura.addListener("onTrackEnded", () => void this.ended());
    Aura.addListener("onPlayerError", (error) => void this.nativeFailed(error));
    Aura.addListener("onRemoteCommand", ({ command }) => {
      if (command === "next") void this.next();
      if (command === "previous") void this.previous();
    });
    settings.on(() => this.applyVolume());
  }

  // MARK: Reading

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  snapshot = (): QueueState => this.snap;

  private build(): QueueState {
    const current = this.tracks[this.index] ?? null;
    return {
      tracks: this.tracks,
      index: this.index,
      current,
      source: this.source,
      player: this.player,
      error: this.error,
      stream: current ? (this.streams.get(current.id)?.info ?? null) : null,
      shuffle: this.unshuffled != null,
      repeat: this.repeat,
      sleep: this.sleep,
      preparing: this.preparing,
    };
  }

  private emit() {
    this.snap = this.build();
    this.listeners.forEach((l) => l());
  }

  // MARK: Starting things

  /** Plays [item] now and fills the queue behind it with its radio. */
  async playSong(item: Item | Track, playlistId?: string | null) {
    const track = asTrack(item);
    this.tracks = [track];
    this.unshuffled = null;
    this.source = null;
    this.radio = null;
    await this.start(0);
    const list = playlistId ?? `RDAMVM${track.id}`;
    try {
      const page = await fetchNext({ v: track.id, list });
      if (this.tracks[this.index]?.id !== track.id) return;
      const rest = page.tracks.map(toTrack).filter((t) => t.id !== track.id);
      // Keep anything queued in the meantime.
      const queuedMeanwhile = this.tracks.slice(this.index + 1);
      this.tracks = [...this.tracks.slice(0, this.index + 1), ...queuedMeanwhile, ...rest];
      this.radio = { list, token: page.continuation };
      if (!this.source && page.title) this.source = page.title;
      if (page.tracks[0] && !track.title) this.tracks[this.index] = { ...toTrack(page.tracks[0]), id: track.id };
      this.emit();
      void this.queueNext();
    } catch {
      // The song plays on; there's just nothing after it yet.
    }
  }

  /** Plays [tracks] from [start]; [source] names it in the player ("Playing from …"). */
  async playTracks(tracks: Track[], start = 0, options: { source?: string; shuffle?: boolean; radio?: Radio | null } = {}) {
    if (!tracks.length) return;
    let list = tracks;
    let first = start;
    this.unshuffled = null;
    if (options.shuffle) {
      this.unshuffled = tracks;
      const head = tracks[Math.floor(Math.random() * tracks.length)];
      list = [head, ...shuffled(tracks.filter((t) => t !== head))];
      first = 0;
    }
    this.tracks = list;
    this.source = options.source ?? null;
    this.radio = options.radio ?? null;
    await this.start(first);
  }

  /** A playlist or radio by id, through YouTube's queue. */
  async playList(list: string, options: { source?: string; shuffle?: boolean; videoId?: string } = {}) {
    const page = await fetchNext({ list, v: options.videoId });
    const tracks = page.tracks.map(toTrack);
    const isRadio = list.startsWith("RD");
    await this.playTracks(tracks, 0, {
      source: options.source ?? page.title ?? undefined,
      shuffle: options.shuffle,
      radio: isRadio || page.continuation ? { list, token: page.continuation } : null,
    });
  }

  // MARK: Controls

  async toggle() {
    if (this.index < 0) return;
    if (this.player.intendsToPlay || this.player.state === "playing" || this.player.state === "loading") await Aura.pause();
    else if (this.player.state === "idle" || this.restored) {
      this.restored = false;
      await this.start(this.index, this.player.position);
    } else await Aura.play();
  }

  async play() {
    if (this.player.state === "idle" || this.restored) await this.toggle();
    else await Aura.play();
  }

  async pause() {
    await Aura.pause();
  }

  async next() {
    if (this.index + 1 < this.tracks.length) await this.start(this.index + 1);
    else if (this.repeat === "all" && this.tracks.length) await this.start(0);
  }

  async previous() {
    if (this.player.position > 3 || this.index <= 0) await Aura.seek(0);
    else await this.start(this.index - 1);
  }

  async seek(seconds: number) {
    this.lastPosition = seconds;
    this.player = { ...this.player, position: seconds };
    this.emit();
    await Aura.seek(seconds);
  }

  async skipTo(index: number) {
    if (index >= 0 && index < this.tracks.length) await this.start(index);
  }

  playNext(items: (Item | Track)[]) {
    const tracks = items.map(asTrack);
    if (this.index < 0) {
      void this.playTracks(tracks);
      return;
    }
    this.tracks = [...this.tracks.slice(0, this.index + 1), ...tracks, ...this.tracks.slice(this.index + 1)];
    if (this.unshuffled) this.unshuffled = [...this.unshuffled, ...tracks];
    this.emit();
    void this.queueNext();
    this.saveSoon();
  }

  addToQueue(items: (Item | Track)[]) {
    const tracks = items.map(asTrack);
    if (this.index < 0) {
      void this.playTracks(tracks);
      return;
    }
    this.tracks = [...this.tracks, ...tracks];
    if (this.unshuffled) this.unshuffled = [...this.unshuffled, ...tracks];
    this.emit();
    void this.queueNext();
    this.saveSoon();
  }

  removeAt(at: number) {
    if (at === this.index || at < 0 || at >= this.tracks.length) return;
    const removed = this.tracks[at];
    this.tracks = this.tracks.filter((_, i) => i !== at);
    if (this.unshuffled) this.unshuffled = this.unshuffled.filter((t) => t !== removed);
    if (at < this.index) this.index--;
    this.emit();
    void this.queueNext();
    this.saveSoon();
  }

  move(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= this.tracks.length || to >= this.tracks.length) return;
    const list = [...this.tracks];
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    const current = this.tracks[this.index];
    this.tracks = list;
    this.index = list.indexOf(current);
    this.emit();
    void this.queueNext();
    this.saveSoon();
  }

  clearUpcoming() {
    this.tracks = this.tracks.slice(0, this.index + 1);
    this.radio = null;
    this.unshuffled = null;
    this.emit();
    void this.queueNext();
    this.saveSoon();
  }

  toggleShuffle() {
    const current = this.tracks[this.index];
    if (!current) return;
    if (this.unshuffled) {
      // Back to the original order, keeping anything added since.
      const extra = this.tracks.filter((t) => !this.unshuffled!.includes(t));
      const order = [...this.unshuffled, ...extra];
      this.tracks = order;
      this.index = order.indexOf(current);
      this.unshuffled = null;
    } else {
      this.unshuffled = this.tracks;
      const rest = this.tracks.filter((_, i) => i !== this.index);
      this.tracks = [current, ...shuffled(rest)];
      this.index = 0;
    }
    this.emit();
    void this.queueNext();
    this.saveSoon();
  }

  cycleRepeat() {
    this.repeat = this.repeat === "off" ? "all" : this.repeat === "all" ? "one" : "off";
    this.emit();
    void this.queueNext();
    this.saveSoon();
  }

  // MARK: Sleep timer, with the Android app's fade (playback/SleepFade.kt)

  setSleep(minutes: number | "song" | null) {
    if (this.sleepTimer) clearInterval(this.sleepTimer);
    this.sleepTimer = null;
    this.sleepGain = 1;
    this.sleep = minutes == null ? null : minutes === "song" ? { kind: "song" } : { kind: "at", at: Date.now() + minutes * 60e3, minutes };
    this.applyVolume();
    if (this.sleep) this.sleepTimer = setInterval(() => this.sleepTick(), 500);
    this.emit();
  }

  private sleepTick() {
    const sleep = this.sleep;
    if (!sleep) return;
    let left: number;
    let fade: number;
    if (sleep.kind === "at") {
      left = sleep.at - Date.now();
      fade = SLEEP_FADE_MS;
    } else {
      const duration = this.player.duration ?? this.tracks[this.index]?.duration ?? 0;
      if (!duration) return;
      left = (duration - this.player.position) * 1000;
      fade = SONG_FADE_MS;
    }
    this.sleepGain = Math.min(1, Math.max(0, left / fade));
    this.applyVolume();
    if (left <= 250) void this.finishSleep();
  }

  private async finishSleep() {
    const endOfSong = this.sleep?.kind === "song";
    if (this.sleepTimer) clearInterval(this.sleepTimer);
    this.sleepTimer = null;
    this.sleep = null;
    await Aura.pause();
    if (endOfSong) await this.next().then(() => Aura.pause());
    setTimeout(() => {
      this.sleepGain = 1;
      this.applyVolume();
    }, 800);
    this.emit();
  }

  // MARK: Internals

  private async start(index: number, startAt = 0) {
    const track = this.tracks[index];
    if (!track) return;
    const generation = ++this.generation;
    this.index = index;
    this.error = null;
    this.preparing = true;
    this.queuedNext = null;
    this.restored = false;
    this.resetCounting(startAt);
    this.emit();
    try {
      const stream = await this.stream(track.id);
      if (generation !== this.generation) return;
      this.loudnessGain = gainFor(stream);
      this.applyVolume();
      await Aura.load(this.nativeTrack(track, stream), startAt, true);
      if (generation !== this.generation) return;
      this.preparing = false;
      this.emit();
      void this.queueNext();
      void this.maybeLoadMore();
      this.saveSoon();
    } catch (error) {
      if (generation !== this.generation) return;
      this.preparing = false;
      this.error = friendly(error);
      this.emit();
    }
  }

  /** The song after the current one, as the native player should move on to it. */
  private upcoming(): Track | null {
    if (this.repeat === "one") return null;
    const next = this.tracks[this.index + 1];
    if (next) return next;
    return this.repeat === "all" ? (this.tracks[0] ?? null) : null;
  }

  /** Resolves the song after the current one and hands it to the native player. */
  private async queueNext() {
    const generation = this.generation;
    const upcoming = this.upcoming();
    if (!upcoming) {
      if (this.queuedNext) await Aura.setNext(null);
      this.queuedNext = null;
      return;
    }
    if (this.queuedNext === upcoming.id) return;
    try {
      const stream = await this.stream(upcoming.id);
      if (generation !== this.generation || this.upcoming()?.id !== upcoming.id) return;
      await Aura.setNext(this.nativeTrack(upcoming, stream));
      this.queuedNext = upcoming.id;
    } catch {
      // Resolved again when its turn comes, through start().
    }
  }

  private nativeAdvanced(id: string) {
    let at = this.tracks.findIndex((t, i) => i > this.index && t.id === id);
    if (at < 0 && this.repeat === "all" && this.tracks[0]?.id === id) at = 0;
    if (at < 0) return;
    this.generation++;
    this.index = at;
    this.queuedNext = null;
    this.error = null;
    this.preparing = false;
    this.resetCounting(0);
    const stream = this.streams.get(id)?.info;
    if (stream) this.loudnessGain = gainFor(stream);
    this.applyVolume();
    if (this.sleep?.kind === "song") void this.finishSleep();
    this.emit();
    void this.queueNext();
    void this.maybeLoadMore();
    this.saveSoon();
  }

  /** The current song ended with nothing queued natively. */
  private async ended() {
    if (this.sleep?.kind === "song") {
      await this.finishSleep();
      return;
    }
    if (this.repeat === "one") {
      await Aura.seek(0);
      await Aura.play();
      this.resetCounting(0);
      return;
    }
    if (this.index + 1 < this.tracks.length) await this.start(this.index + 1);
    else if (this.repeat === "all" && this.tracks.length) await this.start(0);
    else {
      await this.maybeLoadMore(true);
      if (this.index + 1 < this.tracks.length) await this.start(this.index + 1);
    }
  }

  /** A refused URL: skip that client and try once more, as StreamDataSource does on Android. */
  private async nativeFailed(error: PlayerError) {
    const id = error.id;
    const failedStream = id ? this.streams.get(id)?.info : undefined;
    if (id && failedStream) {
      Aura.reportStreamFailure(id, failedStream.client);
      this.streams.delete(id);
    }
    if (!error.current || !id) {
      this.queuedNext = null;
      void this.queueNext();
      return;
    }
    if (!this.retried.has(id)) {
      this.retried.add(id);
      await this.start(this.index, this.player.position);
      return;
    }
    this.error = "This song wouldn't play. Skipping it.";
    this.emit();
    setTimeout(() => {
      if (this.tracks[this.index]?.id === id) void this.next();
    }, 1500);
  }

  private onState(state: PlayerState) {
    // Count a play after half a minute, or half of a short song, actually listened to.
    if (state.state === "playing") {
      const delta = state.position - this.lastPosition;
      if (delta > 0 && delta < 2) this.listened += delta;
      const duration = state.duration ?? this.tracks[this.index]?.duration ?? 0;
      const needed = Math.min(30, Math.max(8, duration / 2 || 30));
      const track = this.tracks[this.index];
      if (!this.counted && track && this.listened >= needed) {
        this.counted = true;
        recordPlay(track);
      }
    }
    this.lastPosition = state.position;
    this.player = state;
    if (state.state === "playing") this.restored = false;
    this.emit();
    if (state.state === "playing" && Math.round(state.position) % 15 === 0) this.saveSoon();
  }

  private resetCounting(position: number) {
    this.listened = 0;
    this.counted = false;
    this.lastPosition = position;
  }

  private async stream(id: string): Promise<StreamInfo> {
    const cached = this.streams.get(id);
    if (cached && cached.validUntil > Date.now()) return cached.info;
    const info = await resolveStream(id, { quality: settings.get().quality });
    // Like Android: trust a URL for 80% of its stated life.
    const life = Math.max(60_000, info.expiresAtMs - Date.now());
    this.streams.set(id, { info, validUntil: Date.now() + life * 0.8 });
    if (this.streams.size > 60) this.streams.delete(this.streams.keys().next().value as string);
    return info;
  }

  private nativeTrack(track: Track, stream: StreamInfo): NativeTrack {
    return {
      id: track.id,
      url: stream.url,
      headers: stream.headers,
      title: track.title || stream.title || "",
      artist: artistLine(track) || stream.author || "",
      album: track.album?.name ?? null,
      artwork: sized(track.thumbnail, 800) ?? stream.thumbnail,
      duration: track.duration ?? stream.durationSeconds,
      // Some clients' URLs only answer bounded byte ranges; the native side then fetches in chunks.
      chunkSize: stream.requireBoundedRange || stream.useRangeChunks ? stream.rangeChunkSize || 1_048_576 : null,
      contentLength: stream.contentLength,
      mimeType: stream.mimeType,
    };
  }

  private applyVolume() {
    const even = settings.get().evenVolume ? this.loudnessGain : 1;
    void Aura.setVolume(even * this.sleepGain);
  }

  private async maybeLoadMore(force = false) {
    if (this.loadingMore || (!force && this.index < this.tracks.length - 4)) return;
    const last = this.tracks[this.tracks.length - 1];
    if (!last) return;
    this.loadingMore = true;
    try {
      // At the end of an album or playlist, carry on with a radio from its last song.
      const radio = this.radio ?? { list: `RDAMVM${last.id}`, token: null };
      const page = radio.token ? await fetchNext({ token: radio.token, list: radio.list }) : await fetchNext({ v: last.id, list: radio.list });
      const known = new Set(this.tracks.map((t) => t.id));
      const fresh = page.tracks.map(toTrack).filter((t) => !known.has(t.id));
      this.tracks = [...this.tracks, ...fresh];
      if (this.unshuffled) this.unshuffled = [...this.unshuffled, ...fresh];
      this.radio = page.continuation ? { list: radio.list, token: page.continuation } : null;
      this.emit();
      void this.queueNext();
    } catch {
      // Tried again when the next song starts.
    } finally {
      this.loadingMore = false;
    }
  }

  // MARK: Between launches

  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  private saveSoon() {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      const from = Math.max(0, this.index - 50);
      const state: Saved = {
        tracks: this.tracks.slice(from, this.index + 150),
        index: this.index - from,
        position: this.player.position,
        source: this.source,
        shuffle: this.unshuffled != null,
        repeat: this.repeat,
        radio: this.radio,
      };
      savedQueue.save(state);
    }, 1500);
  }

  /** Puts last session's queue back, paused, so play picks up where it left off. */
  restore() {
    const saved = savedQueue.load<Saved>();
    if (!saved?.tracks?.length || this.index >= 0) return;
    this.tracks = saved.tracks;
    this.index = Math.min(saved.index, saved.tracks.length - 1);
    this.source = saved.source;
    this.repeat = saved.repeat ?? "off";
    this.radio = saved.radio ?? null;
    this.player = { state: "paused", intendsToPlay: false, position: saved.position ?? 0, duration: this.tracks[this.index]?.duration ?? undefined };
    this.restored = true;
    this.emit();
  }
}

/** Items and tracks share their fields, so either becomes a clean Track. */
const asTrack = (item: Item | Track): Track => toTrack(item as Item);

function gainFor(stream: StreamInfo): number {
  // "Even out volume": loud masters turned down to YouTube's reference, never quiet ones up.
  const db = stream.loudnessDb;
  return db != null && db > 0 ? Math.pow(10, -db / 20) : 1;
}

function friendly(error: unknown): string {
  const message = String((error as Error)?.message ?? error);
  if (/UNAVAILABLE|unavailable/.test(message)) return "This song isn't available.";
  if (/AGE_RESTRICTED/.test(message)) return "This song is age-restricted.";
  if (/NETWORK|network|offline|timed out/i.test(message)) return "Couldn't reach YouTube. Check your connection.";
  return "This song wouldn't play.";
}

export const queue = new Queue();

/** The queue, re-rendering on every change. */
export function useQueue(): QueueState {
  return useSyncExternalStore(queue.subscribe, queue.snapshot);
}

/** One part of the queue state, re-rendering only when it changes. */
export function useQueueSelect<T>(select: (s: QueueState) => T): T {
  return useSyncExternalStore(queue.subscribe, () => select(queue.snapshot()));
}

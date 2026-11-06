// The play queue, in JavaScript like the web player's lib/player.ts, driving the native player.
// The native side only ever holds the current song and the next one; when the current song ends
// it moves on by itself (so it works with the screen locked) and tells us, and we queue the one
// after. Radios continue themselves, as in the Android app's playback/Playback.kt.

import Aura, { NativeTrack, PlayerError, PlayerState, StreamInfo, resolveStream } from "../../modules/aura-native";
import { Item, next as fetchNext } from "../yt/music";

export type Track = {
  id: string;
  title: string;
  artists: { name: string; id?: string | null }[];
  album?: { name: string; id?: string | null } | null;
  thumbnail?: string | null;
  duration?: number | null;
};

export type QueueState = {
  tracks: Track[];
  index: number;
  player: PlayerState;
  error: string | null;
  stream: StreamInfo | null;
};

export function toTrack(item: Item): Track {
  return {
    id: item.id,
    title: item.title,
    artists: item.artists ?? [],
    album: item.album ?? null,
    thumbnail: item.thumbnail ?? null,
    duration: item.duration ?? null,
  };
}

/** Bigger artwork than search rows carry, for the lock screen. Same rewrite as web/src/lib/api.ts. */
export function sized(url: string | null | undefined, px: number): string | null {
  if (!url) return null;
  if (/googleusercontent\.com|ggpht\.com/.test(url)) {
    return url.replace(/=w\d+-h\d+[^&?#]*/, `=w${px}-h${px}-l90-rj`).replace(/=s\d+[^&?#]*/, `=s${px}`);
  }
  return url;
}

const artistLine = (track: Track) => track.artists.map((a) => a.name).join(", ");

type Listener = (state: QueueState) => void;

class Queue {
  private tracks: Track[] = [];
  private index = -1;
  private radio: { list: string; token: string | null } | null = null;
  private loadingMore = false;
  private player: PlayerState = { state: "idle", intendsToPlay: false, position: 0 };
  private error: string | null = null;
  private streams = new Map<string, { info: StreamInfo; validUntil: number }>();
  private retried = new Set<string>();
  /** Which song the native side holds as "next". */
  private queuedNext: string | null = null;
  private listeners = new Set<Listener>();
  /** Bumped by every new start, so slow answers for an old song are dropped. */
  private generation = 0;
  evenVolume = true;

  constructor() {
    Aura.addListener("onPlayerState", (state) => {
      this.player = state;
      this.emit();
    });
    Aura.addListener("onTrackChanged", ({ id }) => this.nativeAdvanced(id));
    Aura.addListener("onTrackEnded", () => {
      if (this.index + 1 < this.tracks.length) void this.start(this.index + 1);
    });
    Aura.addListener("onPlayerError", (error) => void this.nativeFailed(error));
    Aura.addListener("onRemoteCommand", ({ command }) => {
      if (command === "next") void this.next();
      if (command === "previous") void this.previous();
    });
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  snapshot(): QueueState {
    const current = this.tracks[this.index];
    return {
      tracks: this.tracks,
      index: this.index,
      player: this.player,
      error: this.error,
      stream: current ? (this.streams.get(current.id)?.info ?? null) : null,
    };
  }

  /** Plays [track] now and fills the queue behind it with its radio. */
  async playSong(track: Track, playlistId?: string | null) {
    this.tracks = [track];
    this.radio = null;
    await this.start(0);
    const list = playlistId ?? `RDAMVM${track.id}`;
    try {
      const page = await fetchNext({ v: track.id, list });
      if (this.tracks[0]?.id !== track.id) return;
      const rest = page.tracks.map(toTrack).filter((t) => t.id !== track.id);
      this.tracks = [...this.tracks.slice(0, this.index + 1), ...rest];
      this.radio = { list, token: page.continuation };
      this.emit();
      void this.queueNext();
    } catch {
      // The song plays on; there's just nothing after it yet.
    }
  }

  /** Plays [tracks] from [start], with no radio after. */
  async playTracks(tracks: Track[], start = 0) {
    this.tracks = tracks;
    this.radio = null;
    await this.start(start);
  }

  async toggle() {
    if (this.player.state === "playing" || this.player.state === "loading") await Aura.pause();
    else if (this.index >= 0) await Aura.play();
  }

  async next() {
    if (this.index + 1 < this.tracks.length) await this.start(this.index + 1);
  }

  async previous() {
    if (this.player.position > 4 || this.index <= 0) await Aura.seek(0);
    else await this.start(this.index - 1);
  }

  async seek(seconds: number) {
    await Aura.seek(seconds);
  }

  async skipTo(index: number) {
    if (index >= 0 && index < this.tracks.length) await this.start(index);
  }

  // MARK: Internals

  private async start(index: number, startAt = 0) {
    const track = this.tracks[index];
    if (!track) return;
    const generation = ++this.generation;
    this.index = index;
    this.error = null;
    this.queuedNext = null;
    this.emit();
    try {
      const stream = await this.stream(track.id);
      if (generation !== this.generation) return;
      this.applyVolume(stream);
      await Aura.load(this.nativeTrack(track, stream), startAt, true);
      this.emit();
      void this.queueNext();
      void this.maybeLoadMore();
    } catch (error) {
      if (generation !== this.generation) return;
      this.error = `Couldn't play ${track.title}: ${(error as Error).message}`;
      this.emit();
    }
  }

  /** Resolves the song after the current one and hands it to the native player. */
  private async queueNext() {
    const generation = this.generation;
    const upcoming = this.tracks[this.index + 1];
    if (!upcoming) {
      if (this.queuedNext) await Aura.setNext(null);
      this.queuedNext = null;
      return;
    }
    if (this.queuedNext === upcoming.id) return;
    try {
      const stream = await this.stream(upcoming.id);
      if (generation !== this.generation || this.tracks[this.index + 1]?.id !== upcoming.id) return;
      await Aura.setNext(this.nativeTrack(upcoming, stream));
      this.queuedNext = upcoming.id;
    } catch {
      // Resolved again when its turn comes, through start().
    }
  }

  private nativeAdvanced(id: string) {
    const at = this.tracks.findIndex((t, i) => i > this.index && t.id === id);
    if (at < 0) return;
    this.generation++;
    this.index = at;
    this.queuedNext = null;
    this.error = null;
    const stream = this.streams.get(id)?.info;
    if (stream) this.applyVolume(stream);
    this.emit();
    void this.queueNext();
    void this.maybeLoadMore();
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
    this.error = `Playback failed: ${error.message}${error.httpStatus ? ` (HTTP ${error.httpStatus})` : ""}`;
    this.emit();
  }

  private async stream(id: string): Promise<StreamInfo> {
    const cached = this.streams.get(id);
    if (cached && cached.validUntil > Date.now()) return cached.info;
    const info = await resolveStream(id);
    // Like Android: trust a URL for 80% of its stated life.
    const life = Math.max(60_000, info.expiresAtMs - Date.now());
    this.streams.set(id, { info, validUntil: Date.now() + life * 0.8 });
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
      artwork: sized(track.thumbnail, 544) ?? stream.thumbnail,
      duration: track.duration ?? stream.durationSeconds,
    };
  }

  /** "Even out volume": loud masters turned down to YouTube's reference, never quiet ones up. */
  private applyVolume(stream: StreamInfo) {
    const db = stream.loudnessDb;
    const gain = this.evenVolume && db != null && db > 0 ? Math.pow(10, -db / 20) : 1;
    void Aura.setVolume(gain);
  }

  private async maybeLoadMore() {
    if (this.loadingMore || this.index < this.tracks.length - 3) return;
    const last = this.tracks[this.tracks.length - 1];
    if (!last) return;
    this.loadingMore = true;
    try {
      const radio = this.radio ?? { list: `RDAMVM${last.id}`, token: null };
      const page = radio.token
        ? await fetchNext({ token: radio.token, list: radio.list })
        : await fetchNext({ v: last.id, list: radio.list });
      const known = new Set(this.tracks.map((t) => t.id));
      const fresh = page.tracks.map(toTrack).filter((t) => !known.has(t.id));
      this.tracks = [...this.tracks, ...fresh];
      this.radio = page.continuation ? { list: radio.list, token: page.continuation } : null;
      this.emit();
      void this.queueNext();
    } catch {
      // Tried again when the next song starts.
    } finally {
      this.loadingMore = false;
    }
  }

  private emit() {
    const state = this.snapshot();
    this.listeners.forEach((l) => l(state));
  }
}

export const queue = new Queue();

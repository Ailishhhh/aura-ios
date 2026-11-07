import { NativeModule, requireNativeModule } from "expo";

/** A song as the native player takes it. */
export type NativeTrack = {
  id: string;
  url: string;
  headers?: Record<string, string>;
  title: string;
  artist: string;
  album?: string | null;
  artwork?: string | null;
  duration?: number | null;
  /** Fetch in bounded byte ranges of this size (streams that refuse open-ended requests). */
  chunkSize?: number | null;
  contentLength?: number | null;
  mimeType?: string | null;
};

/** What InnerTubeX found for a song (shared/…/AuraStreams.kt StreamInfo). */
export type StreamInfo = {
  videoId: string;
  url: string;
  headers: Record<string, string>;
  mimeType: string | null;
  codecs: string | null;
  itag: number;
  bitrate: number | null;
  contentLength: number | null;
  expiresAtMs: number;
  loudnessDb: number | null;
  client: string;
  requireBoundedRange: boolean;
  rangeChunkSize: number;
  useRangeChunks: boolean;
  title: string | null;
  author: string | null;
  durationSeconds: number | null;
  thumbnail: string | null;
};

export type PlayerState = {
  state: "idle" | "loading" | "playing" | "paused";
  intendsToPlay: boolean;
  id?: string;
  position: number;
  duration?: number;
  buffered?: number;
};

export type PlayerError = {
  id?: string;
  current: boolean;
  message: string;
  domain?: string;
  code?: number;
  underlying?: string;
  httpStatus?: number;
  comment?: string;
};

export type RemoteCommand = {
  command: "play" | "pause" | "toggle" | "next" | "previous" | "seek";
  position?: number;
};

type Events = {
  onPlayerState(state: PlayerState): void;
  onTrackChanged(event: { id: string }): void;
  onTrackEnded(event: { id: string }): void;
  onPlayerError(error: PlayerError): void;
  onRemoteCommand(command: RemoteCommand): void;
};

declare class AuraNativeModule extends NativeModule<Events> {
  resolveStream(videoId: string, quality: "high" | "low", allowBoundedRange: boolean): Promise<string>;
  reportStreamFailure(videoId: string, client: string): void;
  setSession(cookie: string | null, visitorData: string | null, dataSyncId: string | null): void;
  prewarm(): void;

  load(track: NativeTrack, startAt: number, autoplay: boolean): Promise<void>;
  setNext(track: NativeTrack | null): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  seek(seconds: number): Promise<void>;
  stop(): Promise<void>;
  setVolume(volume: number): Promise<void>;
  setRate(rate: number): Promise<void>;
  getState(): Promise<PlayerState>;

  getCookies(url: string): Promise<string>;
  clearWebData(): Promise<void>;

  smokeVideo(): string | null;
  writeDiagnostics(name: string, contents: string): Promise<void>;
}

const Aura = requireNativeModule<AuraNativeModule>("AuraNative");

export default Aura;

/** Resolves a song's stream and parses the JSON the Kotlin side returns. */
export async function resolveStream(
  videoId: string,
  { quality = "high", allowBoundedRange = true }: { quality?: "high" | "low"; allowBoundedRange?: boolean } = {},
): Promise<StreamInfo> {
  return JSON.parse(await Aura.resolveStream(videoId, quality, allowBoundedRange)) as StreamInfo;
}

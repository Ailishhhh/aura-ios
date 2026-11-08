// A self-test CI runs in the iOS Simulator, since nobody has an iPhone to try each build on.
// CI launches the app with AURA_SMOKE=<videoId>. This resolves the song, plays it, checks the clock
// moves, jumps near the end to check the next song takes over natively, then tours the main
// screens. Each time a screen is ready it writes stage.txt so CI can photograph it, and the
// results go to smoke.json in Documents.

import { router } from "expo-router";

import Aura, { resolveStream } from "../modules/aura-native";
import { parseLink } from "./links";
import { pagePath } from "./nav";
import { queue, QueueState } from "./player/queue";

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(test: (s: QueueState) => boolean, timeoutMs: number): Promise<QueueState | null> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    const state = queue.snapshot();
    if (test(state)) return state;
    await wait(250);
  }
  return null;
}

let stageCount = 0;

/** Tells CI the screen is ready to photograph, then holds it long enough for the shot. */
async function stage(name: string) {
  stageCount++;
  await Aura.writeDiagnostics("stage.txt", `${stageCount}:${name}`);
  await wait(4000);
}

export async function runSmoke(videoId: string): Promise<void> {
  const report: Record<string, unknown> = { startedAt: new Date().toISOString(), videoId };
  const save = () => Aura.writeDiagnostics("smoke.json", JSON.stringify(report, null, 2));
  try {
    report.links = {
      share: parseLink("https://music.youtube.com/watch?v=abc123&list=RDAMVMabc123"),
      wrapped: parseLink(`aura://open?url=${encodeURIComponent("https://music.youtube.com/playlist?list=PL1")}`),
      short: parseLink("https://youtu.be/abc123"),
    };

    const t0 = Date.now();
    try {
      const info = await resolveStream(videoId);
      report.resolve = {
        ok: true,
        ms: Date.now() - t0,
        client: info.client,
        itag: info.itag,
        mimeType: info.mimeType,
        codecs: info.codecs,
        bitrate: info.bitrate,
        requireBoundedRange: info.requireBoundedRange,
        useRangeChunks: info.useRangeChunks,
        headerNames: Object.keys(info.headers),
        title: info.title,
      };
    } catch (error) {
      report.resolve = { ok: false, ms: Date.now() - t0, error: String((error as Error).message ?? error) };
      return;
    }
    await save();

    void queue.playSong({
      id: videoId,
      type: "song",
      title: String((report.resolve as { title?: string }).title ?? ""),
      artists: [],
      album: null,
      thumbnail: null,
      duration: null,
    });
    router.push("/player");
    const playing = await until((s) => s.player.state === "playing" && s.player.position > 3, 45_000);
    const now = queue.snapshot();
    report.playback = {
      ok: playing != null,
      state: now.player.state,
      position: now.player.position,
      duration: now.player.duration ?? null,
      error: now.error,
      queued: now.tracks.length,
    };
    await save();
    if (!playing) return;
    await stage("player");

    // Let the radio arrive and the next song get resolved, then jump near the end.
    await until((s) => s.tracks.length > 1, 20_000);
    await wait(6_000);
    const before = queue.snapshot();
    const duration = before.player.duration ?? 0;
    if (duration > 10) await queue.seek(duration - 3);
    const advanced = await until((s) => s.index > before.index && s.player.state === "playing" && s.player.position > 1, 40_000);
    const after = queue.snapshot();
    report.advance = {
      ok: advanced != null,
      from: before.tracks[before.index]?.id,
      to: after.tracks[after.index]?.id,
      state: after.player.state,
      position: after.player.position,
      error: after.error,
    };
    await save();
    await wait(4_000);
    await stage("player-next");

    // A tour of the main screens, for CI's screenshots.
    const tracks = queue.snapshot().tracks;
    const albumId = tracks.find((t) => t.album?.id)?.album?.id ?? null;
    const artistId = tracks.flatMap((t) => t.artists).find((a) => a.id?.startsWith("UC"))?.id ?? null;
    report.pages = { album: albumId, artist: artistId };
    await save();

    if (router.canDismiss()) router.dismissAll();
    await wait(6_000);
    await stage("home");
    if (albumId) {
      router.push(pagePath("(home)", "album", albumId));
      await wait(7_000);
      await stage("album");
    }
    if (artistId) {
      router.push(pagePath("(home)", "artist", artistId));
      await wait(7_000);
      await stage("artist");
    }
    router.push(pagePath("(home)", "playlist", `RDAMVM${videoId}`));
    await wait(7_000);
    await stage("playlist");
    router.navigate("/(tabs)/(explore)/explore" as never);
    await wait(7_000);
    await stage("explore");
    router.navigate("/(tabs)/(library)/library" as never);
    await wait(4_000);
    await stage("library");
    router.push("/settings");
    await wait(4_000);
    await stage("settings");
  } catch (error) {
    report.crash = String((error as Error).stack ?? error);
  } finally {
    report.finishedAt = new Date().toISOString();
    await save().catch(() => undefined);
    await Aura.writeDiagnostics("stage.txt", `${++stageCount}:done`).catch(() => undefined);
  }
}

// A self-test CI runs in the iOS Simulator, since nobody has an iPhone to try each build on.
// CI opens aura://smoke?v=<id>; this resolves the song, plays it, checks the clock moves, jumps to
// the end to check the next song takes over natively, and writes smoke.json into Documents.

import Aura, { resolveStream } from "../modules/aura-native";
import { parseLink } from "./links";
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

export async function runSmoke(url: string) {
  const report: Record<string, unknown> = { startedAt: new Date().toISOString(), url };
  const save = () => Aura.writeDiagnostics("smoke.json", JSON.stringify(report, null, 2));
  try {
    const link = parseLink(url.replace(/^aura:\/\/smoke/, "aura://watch"));
    if (link?.kind !== "song") throw new Error("smoke needs ?v=<videoId>");
    report.links = {
      share: parseLink("https://music.youtube.com/watch?v=abc123&list=RDAMVMabc123"),
      wrapped: parseLink(`aura://open?url=${encodeURIComponent("https://music.youtube.com/playlist?list=PL1")}`),
      short: parseLink("https://youtu.be/abc123"),
    };

    const t0 = Date.now();
    try {
      const info = await resolveStream(link.videoId);
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

    await queue.playSong({
      id: link.videoId,
      type: "song",
      title: String((report.resolve as any).title ?? ""),
      artists: [],
      album: null,
      thumbnail: null,
      duration: null,
    });
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

    // Let the radio arrive and the next song get resolved, then jump to the end.
    await until((s) => s.tracks.length > 1, 20_000);
    await wait(8_000);
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
  } catch (error) {
    report.crash = String((error as Error).stack ?? error);
  } finally {
    report.finishedAt = new Date().toISOString();
    await save().catch(() => undefined);
  }
}

import assert from "node:assert/strict";
import { test } from "node:test";

import { findLink, parseLink } from "../src/links.ts";

test("music.youtube.com links", () => {
  assert.deepEqual(parseLink("https://music.youtube.com/watch?v=abc123&list=RDAMVMabc123"), {
    kind: "song",
    videoId: "abc123",
    playlistId: "RDAMVMabc123",
  });
  assert.deepEqual(parseLink("https://music.youtube.com/watch?list=PLx"), { kind: "playlist", id: "PLx" });
  assert.deepEqual(parseLink("https://music.youtube.com/playlist?list=PLx"), { kind: "playlist", id: "PLx" });
  assert.deepEqual(parseLink("https://music.youtube.com/channel/UCabc"), { kind: "artist", browseId: "UCabc" });
  assert.deepEqual(parseLink("https://music.youtube.com/browse/MPREb_x"), { kind: "album", browseId: "MPREb_x" });
  assert.deepEqual(parseLink("https://music.youtube.com/browse/VLPLx"), { kind: "playlist", id: "PLx" });
  assert.deepEqual(parseLink("https://music.youtube.com/browse/UCabc"), { kind: "artist", browseId: "UCabc" });
  assert.equal(parseLink("https://music.youtube.com/explore"), null);
});

test("other YouTube hosts", () => {
  assert.deepEqual(parseLink("https://www.youtube.com/watch?v=abc"), { kind: "song", videoId: "abc", playlistId: null });
  assert.deepEqual(parseLink("https://youtu.be/abc?si=xyz"), { kind: "song", videoId: "abc", playlistId: null });
  assert.equal(parseLink("https://example.com/watch?v=abc"), null);
});

test("aura links", () => {
  assert.deepEqual(parseLink("aura://watch?v=abc"), { kind: "song", videoId: "abc", playlistId: null });
  assert.deepEqual(parseLink("aura://playlist?list=PLx"), { kind: "playlist", id: "PLx" });
  const wrapped = `aura://open?url=${encodeURIComponent("https://music.youtube.com/watch?v=abc&list=PLx")}`;
  assert.deepEqual(parseLink(wrapped), { kind: "song", videoId: "abc", playlistId: "PLx" });
});

test("links inside shared text", () => {
  assert.deepEqual(findLink("Listen to this! https://music.youtube.com/watch?v=abc via YouTube Music"), {
    kind: "song",
    videoId: "abc",
    playlistId: null,
  });
  assert.equal(findLink("no links here"), null);
  assert.equal(parseLink("not a url"), null);
});

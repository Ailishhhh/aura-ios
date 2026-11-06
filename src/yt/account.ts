// Your YouTube Music account, once signed in: who you are, your library on YouTube, and keeping
// likes, saves and follows in step with it (the Android app's MusicBackend calls).

import Aura from "../../modules/aura-native";
import { Liked, libraryChanges, likes, toTrack } from "../lib/store";
import { innertube } from "./client";
import { clearCache, playlist, playlistMore } from "./music";
import * as parse from "./parse";
import { Account, Session, isSignedInCookie, session } from "./session";

export const LIBRARY = {
  liked: "LM",
  playlists: "FEmusic_liked_playlists",
  albums: "FEmusic_liked_albums",
  artists: "FEmusic_library_corpus_track_artists",
  songs: "FEmusic_liked_videos",
} as const;

/** Reads the account menu: name, email, handle and photo. */
export async function accountInfo(): Promise<Account | null> {
  const json = await innertube("account/account_menu", {});
  const header = json?.actions?.[0]?.openPopupAction?.popup?.multiPageMenuRenderer?.header?.activeAccountHeaderRenderer;
  if (!header) return null;
  return {
    name: parse.text(header.accountName) || null,
    email: parse.text(header.email) || null,
    handle: parse.text(header.channelHandle) || null,
    photo: parse.thumb(header.accountPhoto) ?? header.accountPhoto?.thumbnails?.slice(-1)?.[0]?.url ?? null,
  };
}

/** Finishes signing in with what the sign-in page left behind. */
export async function completeSignIn(credentials: Omit<Session, "account">): Promise<void> {
  if (!isSignedInCookie(credentials.cookie)) throw new Error("Google didn't sign you in to YouTube Music.");
  session.set({ ...credentials, account: null });
  applySession();
  clearCache();
  const account = await accountInfo().catch(() => null);
  if (!account) {
    session.set(null);
    applySession();
    throw new Error("YouTube Music didn't recognise the sign-in. Try again.");
  }
  session.set({ ...credentials, account });
  void importLikes();
}

export async function signOut() {
  session.set(null);
  applySession();
  clearCache();
  await Aura.clearWebData().catch(() => undefined);
}

/** Hands the session to the Kotlin side, so streams resolve as the user (and Premium) too. */
export function applySession() {
  const s = session.get();
  Aura.setSession(s?.cookie ?? null, s?.visitorData ?? null, s?.dataSyncId ?? null);
}

/** Brings YouTube Music's liked songs into the hearts here, without dropping any made here. */
export async function importLikes(limit = 500) {
  try {
    const first = await playlist(LIBRARY.liked);
    const songs = [...first.songs];
    let token = first.continuation;
    while (token && songs.length < limit) {
      const next = await playlistMore(token);
      songs.push(...next.songs);
      token = next.continuation;
    }
    const mine = likes.get();
    const have = new Set(mine.map((t) => t.id));
    const now = Date.now();
    const fresh: Liked[] = songs.filter((s) => !have.has(s.id)).map((s, i) => ({ ...toTrack(s), at: now - (i + 1) * 1000 }));
    likes.set([...mine, ...fresh].sort((a, b) => b.at - a.at));
  } catch {
    // Tried again on the next launch.
  }
}

// Likes, saves and follows made here go to YouTube Music too while signed in.
libraryChanges.on((change) => {
  if (!change || !session.get()) return;
  const run = async () => {
    switch (change.kind) {
      case "like":
        return innertube(change.on ? "like/like" : "like/removelike", { target: { videoId: change.id } });
      case "save":
        if (!change.playlistId) return;
        return innertube(change.on ? "like/like" : "like/removelike", { target: { playlistId: change.playlistId.replace(/^VL/, "") } });
      case "follow":
        return innertube(change.on ? "subscription/subscribe" : "subscription/unsubscribe", { channelIds: [change.id] });
    }
  };
  void run().catch(() => undefined);
});

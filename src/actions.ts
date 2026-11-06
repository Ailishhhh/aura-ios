// Long-press menus, as native iOS action sheets (the Android app's ui/components/ActionSheet.kt).

import { ActionSheetIOS, Alert } from "react-native";
import { router } from "expo-router";

import { addToPlaylist, createPlaylist, isFollowing, isLiked, isSaved, playlists, toTrack, toggleFollow, toggleLike, toggleSaved } from "./lib/store";
import { Tab, openAlbum, openArtist, pagePath, share } from "./nav";
import { queue } from "./player/queue";
import { haptic } from "./ui/primitives";
import type { Item } from "./yt/types";

type Action = { label: string; run: () => void; destructive?: boolean };

function show(title: string, subtitle: string | undefined, actions: Action[]) {
  haptic.firm();
  ActionSheetIOS.showActionSheetWithOptions(
    {
      title,
      message: subtitle,
      options: [...actions.map((a) => a.label), "Cancel"],
      cancelButtonIndex: actions.length,
      destructiveButtonIndex: actions.findIndex((a) => a.destructive),
      userInterfaceStyle: "dark",
    },
    (index) => actions[index]?.run(),
  );
}

/** Asks which playlist [items] go to, or makes a new one. */
export function chooseplaylist(items: Item[]) {
  const tracks = items.map((i) => toTrack(i));
  const lists = playlists.get();
  const make = () =>
    Alert.prompt("New playlist", undefined, (name) => {
      if (name?.trim()) {
        createPlaylist(name, tracks);
        haptic.success();
      }
    });
  if (!lists.length) return make();
  show("Add to a playlist", undefined, [
    { label: "New playlist…", run: make },
    ...lists.slice(0, 8).map((p) => ({
      label: p.title,
      run: () => {
        addToPlaylist(p.id, tracks);
        haptic.success();
      },
    })),
  ]);
}

export function songActions(item: Item, tab: Tab, extra: Action[] = []) {
  const artists = (item.artists ?? []).filter((a) => a.id);
  const actions: Action[] = [
    { label: "Play next", run: () => queue.playNext([item]) },
    { label: "Add to queue", run: () => queue.addToQueue([item]) },
    { label: isLiked(item.id) ? "Remove from Liked Songs" : "Add to Liked Songs", run: () => toggleLike(item) },
    { label: "Add to a playlist…", run: () => chooseplaylist([item]) },
    { label: "Start radio", run: () => void queue.playSong(item) },
    ...artists.slice(0, 2).map((a) => ({ label: artists.length > 1 ? `Go to ${a.name}` : "Go to artist", run: () => openArtist(tab, a.id!) })),
    ...(item.album?.id ? [{ label: "Go to album", run: () => openAlbum(tab, item.album!.id!) }] : []),
    { label: "Share", run: () => share(item) },
    ...extra,
  ];
  show(item.title, item.artists?.map((a) => a.name).join(", ") || item.subtitle, actions);
}

export function itemActions(item: Item, tab: Tab) {
  if (item.type === "song" || item.type === "video" || item.type === "episode") return songActions(item, tab);
  const actions: Action[] = [];
  if (item.type === "album" || item.type === "playlist") {
    actions.push({
      label: "Play",
      run: () => {
        if (item.type === "album" && item.playlistId) void queue.playList(item.playlistId, { source: item.title });
        else if (item.type === "playlist") void queue.playList(item.id.replace(/^VL/, ""), { source: item.title });
        else router.push(pagePath(tab, "album", item.id));
      },
    });
    actions.push({ label: isSaved(item.id) ? "Remove from library" : "Save to library", run: () => toggleSaved(item) });
  }
  if (item.type === "artist") {
    actions.push({ label: isFollowing(item.id) ? "Unfollow" : "Follow", run: () => toggleFollow(item) });
    actions.push({ label: "Go to artist", run: () => openArtist(tab, item.id) });
  }
  actions.push({ label: "Share", run: () => share(item) });
  show(item.title, item.subtitle, actions);
}

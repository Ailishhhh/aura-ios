// Collections that live on the phone: Liked Songs, Listening History, Your Listening, and
// playlists you've made.

import { router, useLocalSearchParams } from "expo-router";
import { useMemo } from "react";
import { ActionSheetIOS, Alert, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { songActions } from "../../../../src/actions";
import {
  Track,
  clearHistory,
  deletePlaylist,
  history,
  likes,
  playCounts,
  playlists,
  recentTracks,
  topArtists,
  updatePlaylist,
  useValue,
} from "../../../../src/lib/store";
import { openArtist, useTab } from "../../../../src/nav";
import { queue } from "../../../../src/player/queue";
import { space, theme, type } from "../../../../src/theme";
import { Collection } from "../../../../src/ui/Collection";
import { SongRow } from "../../../../src/ui/items";
import { Message, Tap } from "../../../../src/ui/primitives";
import type { Item } from "../../../../src/yt/types";

const asItem = (t: Track): Item => ({ ...t, type: t.type });

export default function Mine() {
  const { id } = useLocalSearchParams<{ id: string }>();
  if (id === "liked") return <Liked />;
  if (id === "history") return <History />;
  if (id === "stats") return <Stats />;
  return <Made id={id ?? ""} />;
}

function Liked() {
  const liked = useValue(likes);
  const items = liked.map(asItem);
  return (
    <Collection
      cover={null}
      title="Liked Songs"
      eyebrow="Liked songs"
      byline="Your hearts, in one place"
      meta={liked.length ? `${liked.length} song${liked.length === 1 ? "" : "s"}` : null}
      songs={items}
      source="Liked Songs"
      onPlay={() => void queue.playTracks(liked, 0, { source: "Liked Songs" })}
      onShuffle={() => void queue.playTracks(liked, 0, { source: "Liked Songs", shuffle: true })}
      empty={{ title: "Nothing liked yet", body: "Double-tap a cover in the player, or tap the heart." }}
    />
  );
}

function History() {
  const plays = useValue(history);
  const tracks = useMemo(() => recentTracks(plays, 200), [plays]);
  const items = tracks.map(asItem);
  return (
    <Collection
      cover={null}
      title="Listening History"
      eyebrow="History"
      byline="Every song you've played, most recent first"
      songs={items}
      source="Listening history"
      onPlay={() => void queue.playTracks(tracks, 0, { source: "Listening history" })}
      onShuffle={() => void queue.playTracks(tracks, 0, { source: "Listening history", shuffle: true })}
      onMore={() =>
        ActionSheetIOS.showActionSheetWithOptions(
          { options: ["Clear history", "Cancel"], destructiveButtonIndex: 0, cancelButtonIndex: 1, userInterfaceStyle: "dark" },
          (i) => i === 0 && clearHistory(),
        )
      }
      empty={{ title: "Nothing played yet", body: "Songs show up here after half a minute of listening." }}
    />
  );
}

function Made({ id }: { id: string }) {
  const tab = useTab();
  const list = useValue(playlists, (all) => all.find((p) => p.id === id));
  if (!list) return <Message title="This playlist is gone" />;
  const items = list.tracks.map(asItem);
  return (
    <Collection
      cover={list.tracks[0]?.thumbnail}
      title={list.title}
      eyebrow="Your playlist"
      byline="By you"
      meta={`${list.tracks.length} song${list.tracks.length === 1 ? "" : "s"}`}
      songs={items}
      source={list.title}
      onPlay={() => void queue.playTracks(list.tracks, 0, { source: list.title })}
      onShuffle={() => void queue.playTracks(list.tracks, 0, { source: list.title, shuffle: true })}
      onMore={() =>
        ActionSheetIOS.showActionSheetWithOptions(
          { options: ["Rename", "Delete playlist", "Cancel"], destructiveButtonIndex: 1, cancelButtonIndex: 2, userInterfaceStyle: "dark" },
          (i) => {
            if (i === 0) Alert.prompt("Rename playlist", undefined, (name) => name?.trim() && updatePlaylist(id, () => ({ title: name.trim() })), "plain-text", list.title);
            if (i === 1) {
              deletePlaylist(id);
              router.back();
            }
          },
        )
      }
      renderRow={(item, index) => (
        <SongRow
          item={item}
          list={items}
          source={list.title}
          onPress={() => void queue.playTracks(list.tracks, index, { source: list.title })}
          onLongPress={() =>
            songActions(item, tab, [
              { label: "Remove from this playlist", destructive: true, run: () => updatePlaylist(id, (p) => ({ tracks: p.tracks.filter((_, i) => i !== index) })) },
            ])
          }
        />
      )}
      empty={{ title: "Empty for now", body: "Long-press any song and choose “Add to a playlist”." }}
      onArtist={(a) => a.id && openArtist(tab, a.id)}
    />
  );
}

function Stats() {
  const insets = useSafeAreaInsets();
  const plays = useValue(history);
  const weekAgo = Date.now() - 7 * 86400e3;
  const week = plays.filter((p) => p.at >= weekAgo);
  const artists = useMemo(() => topArtists(plays, weekAgo, 8), [plays, weekAgo]);
  const most = useMemo(() => playCounts(plays).slice(0, 10), [plays]);
  const minutes = Math.round(week.reduce((sum, p) => sum + (p.track.duration ?? 180), 0) / 60);
  const tab = useTab();
  const max = artists[0]?.count ?? 1;

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.night }} contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: 140 }}>
      <View style={{ paddingHorizontal: space.page }}>
        <Text style={type.eyebrow}>This week</Text>
        <Text style={[type.display, { marginTop: 6 }]}>Your Listening</Text>
      </View>
      <View style={styles.tiles}>
        <Tile value={String(week.length)} label="Plays" />
        <Tile value={String(minutes)} label="Minutes" />
        <Tile value={String(new Set(week.map((p) => p.track.artists[0]?.name)).size)} label="Artists" />
      </View>
      {!plays.length ? <Message title="Nothing to count yet" body="Play some music and come back." /> : null}
      {artists.length ? (
        <View style={{ marginTop: space.xxl, paddingHorizontal: space.page, gap: 12 }}>
          <Text style={type.section}>Top artists</Text>
          {artists.map((a) => (
            <Tap key={a.name} onPress={() => a.id && openArtist(tab, a.id)} disabled={!a.id} style={{ gap: 6 }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Text style={type.row}>{a.name}</Text>
                <Text style={type.caption}>{a.count}</Text>
              </View>
              <View style={styles.barTrack}>
                <View style={[styles.bar, { width: `${(a.count / max) * 100}%` }]} />
              </View>
            </Tap>
          ))}
        </View>
      ) : null}
      {most.length ? (
        <View style={{ marginTop: space.xxl }}>
          <Text style={[type.section, { paddingHorizontal: space.page, marginBottom: space.s }]}>Most played</Text>
          {most.map(({ track, count }) => (
            <SongRow key={track.id} item={{ ...asItem(track), subtitle: `${count} plays` }} list={most.map((m) => asItem(m.track))} source="Most played" />
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

function Tile({ value, label }: { value: string; label: string }) {
  return (
    <View style={styles.tile}>
      <Text style={[type.title, { fontSize: 32 }]}>{value}</Text>
      <Text style={type.eyebrow}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", gap: 10, paddingHorizontal: space.page, marginTop: space.xl },
  tile: { flex: 1, backgroundColor: theme.raised, borderRadius: 16, padding: 14, gap: 4, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline },
  barTrack: { height: 6, borderRadius: 3, backgroundColor: theme.raised, overflow: "hidden" },
  bar: { height: 6, borderRadius: 3, backgroundColor: theme.cream },
});

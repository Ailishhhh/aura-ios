// Your library, kept on the phone: liked songs, what you've played, playlists you make, albums and
// playlists you save, artists you follow.

import { router } from "expo-router";
import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeIn, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { itemActions } from "../../../src/actions";
import { createPlaylist, following, history, likes, playlists, saved, useValue } from "../../../src/lib/store";
import { pagePath } from "../../../src/nav";
import { radius, space, theme, type } from "../../../src/theme";
import { Artwork } from "../../../src/ui/Artwork";
import { ItemRow } from "../../../src/ui/items";
import { GlassButton, Icon, Message, Tap } from "../../../src/ui/primitives";
import type { Item } from "../../../src/yt/types";

type Tab = "playlists" | "albums" | "artists";

export default function Library() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const tile = Math.floor((width - space.page * 2 - 16) / 2);
  const [tab, setTab] = useState<Tab>("playlists");
  const liked = useValue(likes);
  const plays = useValue(history);
  const mine = useValue(playlists);
  const kept = useValue(saved);
  const artists = useValue(following);

  const newPlaylist = () =>
    Alert.prompt("New playlist", "Give it a name", (name) => {
      if (name?.trim()) {
        const list = createPlaylist(name);
        router.push(pagePath("(library)", "mine", list.id));
      }
    });

  const savedPlaylists = kept.filter((s) => s.type === "playlist" || s.type === "podcast");
  const savedAlbums = kept.filter((s) => s.type === "album");

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.night }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingTop: insets.top + 70, paddingBottom: 140 }}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={type.eyebrow}>Kept on this iPhone</Text>
          <Text style={[type.display, { marginTop: 6 }]}>Your Library</Text>
        </View>
        <GlassButton icon="plus" label="New playlist" onPress={newPlaylist} />
      </View>

      <View style={{ marginTop: space.xl, gap: 2 }}>
        <Shortcut icon="heart.fill" title="Liked Songs" detail={liked.length ? `${liked.length} song${liked.length === 1 ? "" : "s"}` : "Your hearts, in one place"} onPress={() => router.push(pagePath("(library)", "mine", "liked"))} />
        <Shortcut icon="clock.fill" title="Listening History" detail={plays.length ? `${plays.length} play${plays.length === 1 ? "" : "s"}` : "What you play shows up here"} onPress={() => router.push(pagePath("(library)", "mine", "history"))} />
        <Shortcut icon="chart.bar.fill" title="Your Listening" detail="Top artists and most played" onPress={() => router.push(pagePath("(library)", "mine", "stats"))} />
      </View>

      <View style={styles.tabs}>
        {(["playlists", "albums", "artists"] as Tab[]).map((t) => (
          <Tap key={t} onPress={() => setTab(t)} style={[styles.tab, tab === t && styles.tabActive]} scale={0.95}>
            <Text style={[type.caption, { fontWeight: "600", color: tab === t ? theme.night : theme.cream }]}>{t[0].toUpperCase() + t.slice(1)}</Text>
          </Tap>
        ))}
      </View>

      <Animated.View key={tab} entering={FadeIn.duration(220)} layout={LinearTransition}>
        {tab === "playlists" ? (
          mine.length || savedPlaylists.length ? (
            <>
              {mine.map((p) => (
                <Tap key={p.id} onPress={() => router.push(pagePath("(library)", "mine", p.id))} style={styles.row} scale={0.985}>
                  <Artwork uri={p.tracks[0]?.thumbnail} size={56} radius={radius.s} />
                  <View style={{ flex: 1 }}>
                    <Text style={type.row} numberOfLines={1}>
                      {p.title}
                    </Text>
                    <Text style={type.caption}>
                      By you · {p.tracks.length} song{p.tracks.length === 1 ? "" : "s"}
                    </Text>
                  </View>
                  <Icon name="chevron.right" size={13} color={theme.faint} />
                </Tap>
              ))}
              {savedPlaylists.map((s) => (
                <ItemRow key={s.id} item={s as unknown as Item} />
              ))}
            </>
          ) : (
            <Message title="No playlists yet" body="Make one with +, or save any playlist you find." action="New playlist" onAction={newPlaylist} />
          )
        ) : null}

        {tab === "albums" ? (
          savedAlbums.length ? (
            <View style={styles.grid}>
              {savedAlbums.map((a) => (
                <Tap key={a.id} onPress={() => router.push(pagePath("(library)", "album", a.id))} onLongPress={() => itemActions(a as unknown as Item, "(library)")} style={{ width: tile }}>
                  <Artwork uri={a.thumbnail} size={tile} radius={radius.m} />
                  <Text style={[type.itemTitle, { marginTop: 8 }]} numberOfLines={1}>
                    {a.title}
                  </Text>
                  <Text style={type.caption} numberOfLines={1}>
                    {a.artists?.map((x) => x.name).join(", ") || a.subtitle || "Album"}
                  </Text>
                </Tap>
              ))}
            </View>
          ) : (
            <Message title="No albums saved" body="Tap the bookmark on any album and it lands here." />
          )
        ) : null}

        {tab === "artists" ? (
          artists.length ? (
            artists.map((a) => (
              <Tap key={a.id} onPress={() => router.push(pagePath("(library)", "artist", a.id))} style={styles.row} scale={0.985}>
                <Artwork uri={a.thumbnail} size={56} round />
                <Text style={[type.row, { flex: 1 }]} numberOfLines={1}>
                  {a.title}
                </Text>
                <Icon name="chevron.right" size={13} color={theme.faint} />
              </Tap>
            ))
          ) : (
            <Message title="Not following anyone" body="Follow artists from their page to keep them close." />
          )
        ) : null}
      </Animated.View>
    </ScrollView>
  );
}

function Shortcut({ icon, title, detail, onPress }: { icon: any; title: string; detail: string; onPress: () => void }) {
  return (
    <Tap onPress={onPress} style={styles.row} scale={0.985}>
      <View style={styles.badge}>
        <Icon name={icon} size={22} color={theme.cream} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={type.row}>{title}</Text>
        <Text style={type.caption}>{detail}</Text>
      </View>
      <Icon name="chevron.right" size={13} color={theme.faint} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: space.page, gap: space.m },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: space.page, paddingVertical: 8 },
  badge: { width: 56, height: 56, borderRadius: radius.s, backgroundColor: theme.raised, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: space.page, marginTop: space.xxl, marginBottom: space.m },
  tab: { paddingHorizontal: 16, height: 34, borderRadius: 17, justifyContent: "center", backgroundColor: theme.raised },
  tabActive: { backgroundColor: theme.cream },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 16, paddingHorizontal: space.page },
});

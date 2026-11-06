// An artist: a full-bleed portrait that drifts as you scroll, their name in large serif, Play,
// Radio and Follow, then their songs, albums and the rest.

import { router, useLocalSearchParams } from "expo-router";
import { LinearGradient } from "expo-linear-gradient";
import { useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from "react-native-reanimated";

import { toTrack, toggleFollow, useFollowing } from "../../../../src/lib/store";
import { useLoad } from "../../../../src/lib/useLoad";
import { pagePath, share, useTab } from "../../../../src/nav";
import { queue } from "../../../../src/player/queue";
import { space, theme, type } from "../../../../src/theme";
import { Artwork } from "../../../../src/ui/Artwork";
import { Shelf, SongRow } from "../../../../src/ui/items";
import { GlassButton, Loading, Message, Pill, Tap, haptic } from "../../../../src/ui/primitives";
import { artist } from "../../../../src/yt/music";

export default function Artist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tab = useTab();
  const { width } = useWindowDimensions();
  const page = useLoad(id ?? null, () => artist(id!));
  const following = useFollowing(page.data?.id);
  const [aboutOpen, setAboutOpen] = useState(false);
  const heroHeight = Math.round(width * 1.05);

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const heroStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-300, 0, heroHeight], [-150, 0, heroHeight * 0.45], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [-300, 0], [1.5, 1], Extrapolation.CLAMP) },
    ],
  }));

  const data = page.data;
  const songsSection = data?.sections.find((s) => s.items.some((i) => i.type === "song") && s.list) ?? data?.sections.find((s) => s.items.every((i) => i.type === "song"));
  const topSongs = songsSection?.items.slice(0, 5) ?? [];
  const rest = data?.sections.filter((s) => s !== songsSection) ?? [];

  const play = () => {
    if (!data) return;
    if (topSongs.length) void queue.playTracks(topSongs.map((s) => toTrack(s)), 0, { source: data.title });
    else if (data.radioId) void queue.playList(data.radioId, { source: `${data.title} Radio` });
  };
  const radio = () => {
    if (!data) return;
    const list = data.radioId ?? data.shuffleId;
    if (list) void queue.playList(list, { source: `${data.title} Radio` });
    else if (topSongs.length) void queue.playTracks(topSongs.map((s) => toTrack(s)), 0, { source: data.title, shuffle: true });
  };

  if (page.loading && !data) return <Loading style={{ marginTop: 200 }} />;
  if (page.error && !data) return <Message title="Couldn't open this" body={page.error.message} action="Try again" onAction={page.reload} />;
  if (!data) return null;

  return (
    <Animated.ScrollView style={{ flex: 1, backgroundColor: theme.night }} onScroll={onScroll} scrollEventThrottle={16} contentInsetAdjustmentBehavior="never" contentContainerStyle={{ paddingBottom: 140 }}>
      <View style={{ height: heroHeight, overflow: "hidden" }}>
        <Animated.View style={[StyleSheet.absoluteFill, heroStyle]}>
          <Artwork uri={data.thumbnail} size={width} height={heroHeight} radius={0} />
        </Animated.View>
        <LinearGradient colors={["transparent", "rgba(15,14,12,0.4)", theme.night]} locations={[0.35, 0.7, 1]} style={StyleSheet.absoluteFill} />
        <View style={styles.heroText}>
          <Text style={type.eyebrow}>Artist{data.audience ? ` · ${data.audience}` : ""}</Text>
          <Text style={[type.display, { fontSize: 56, lineHeight: 58 }]} numberOfLines={2} adjustsFontSizeToFit>
            {data.title}
          </Text>
        </View>
      </View>

      <View style={styles.actions}>
        <Pill icon="play.fill" label="Play" primary onPress={play} style={{ flex: 1 }} />
        <Pill icon="dot.radiowaves.left.and.right" label="Radio" onPress={radio} style={{ flex: 1 }} />
        <GlassButton
          icon={following ? "checkmark" : "plus"}
          label={following ? "Following" : "Follow"}
          onPress={() => {
            haptic.success();
            toggleFollow({ id: data.id, title: data.title, thumbnail: data.thumbnail });
          }}
        />
        <GlassButton icon="square.and.arrow.up" label="Share" onPress={() => share({ type: "artist", id: data.id, title: data.title })} />
      </View>

      {topSongs.length ? (
        <View style={{ marginTop: space.l }}>
          <View style={styles.sectionHead}>
            <Text style={type.section}>Top songs</Text>
            {songsSection?.more ? (
              <Tap onPress={() => router.push(pagePath(tab, "browse", songsSection.more!.browseId, { params: songsSection.more!.params ?? undefined, title: `${data.title}: Songs` }))} hitSlop={10}>
                <Text style={[type.caption, { color: theme.cream }]}>See all</Text>
              </Tap>
            ) : null}
          </View>
          {topSongs.map((s, i) => (
            <SongRow key={`${s.id}:${i}`} item={s} list={topSongs} source={data.title} />
          ))}
        </View>
      ) : null}

      {rest.map((section, i) => (
        <Shelf
          key={`${section.title}:${i}`}
          section={section}
          index={i}
          onMore={section.more ? () => router.push(pagePath(tab, "browse", section.more!.browseId, { params: section.more!.params ?? undefined, title: `${data.title}: ${section.title}` })) : undefined}
        />
      ))}

      {data.description ? (
        <Tap onPress={() => setAboutOpen((o) => !o)} style={styles.about} scale={0.99}>
          <Text style={type.eyebrow}>About</Text>
          <Text style={[type.body, { color: theme.muted, marginTop: 8 }]} numberOfLines={aboutOpen ? undefined : 4}>
            {data.description}
          </Text>
          {data.subscribers ? <Text style={[type.caption, { marginTop: 8 }]}>{data.subscribers}</Text> : null}
        </Tap>
      ) : null}
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  heroText: { position: "absolute", left: space.page, right: space.page, bottom: space.l, gap: 6 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space.page, marginTop: space.s },
  sectionHead: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", paddingHorizontal: space.page, marginBottom: space.s },
  about: { margin: space.page, marginTop: space.xxl, padding: space.l, borderRadius: 16, backgroundColor: theme.raised },
});

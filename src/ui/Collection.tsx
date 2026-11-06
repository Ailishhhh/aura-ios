// The page for anything with a track list: albums, playlists, liked songs, history. A big printed
// cover over its own colours, the title in serif, Play and Shuffle, then the songs.

import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { ReactNode } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { Extrapolation, FadeIn, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { space, theme, type } from "../theme";
import { sized } from "../yt/music";
import type { Artist, Item } from "../yt/types";
import { Artwork } from "./Artwork";
import { SongRow } from "./items";
import { GlassButton, Icon, Loading, Message, Pill, Tap } from "./primitives";

type Props = {
  cover: string | null | undefined;
  title: string;
  eyebrow: string;
  artists?: Artist[];
  byline?: string | null;
  meta?: string | null;
  description?: string | null;
  songs: Item[];
  source: string;
  numbered?: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  onPlay?: () => void;
  onShuffle?: () => void;
  saved?: boolean;
  onSave?: () => void;
  onMore?: () => void;
  onArtist?: (artist: Artist) => void;
  onEndReached?: () => void;
  empty?: { title: string; body?: string };
  /** Drawn after the songs: "More from the artist" and the like. */
  footer?: ReactNode;
  renderRow?: (item: Item, index: number) => ReactNode;
};

export function Collection(props: Props) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const coverSize = Math.min(width - 96, 300);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const coverStyle = useAnimatedStyle(() => ({
    transform: [
      { scale: interpolate(scrollY.value, [-200, 0, 260], [1.18, 1, 0.86], Extrapolation.CLAMP) },
      { translateY: interpolate(scrollY.value, [-200, 0, 260], [-30, 0, 60], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(scrollY.value, [0, 300], [1, 0.25], Extrapolation.CLAMP),
  }));
  const glowStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(scrollY.value, [-200, 0, 400], [0, 0, -200], Extrapolation.CLAMP) }],
  }));

  const header = (
    <View>
      <Animated.View style={[StyleSheet.absoluteFill, { height: 520 }, glowStyle]} pointerEvents="none">
        {props.cover ? <Image source={{ uri: sized(props.cover, 120) ?? undefined }} style={StyleSheet.absoluteFill} blurRadius={50} contentFit="cover" /> : null}
        <LinearGradient colors={["rgba(15,14,12,0.35)", "rgba(15,14,12,0.75)", theme.night]} locations={[0, 0.55, 1]} style={StyleSheet.absoluteFill} />
      </Animated.View>
      <View style={{ paddingTop: insets.top + 56, alignItems: "center" }}>
        <Animated.View style={[styles.coverShadow, coverStyle]}>
          {props.cover ? (
            <Artwork uri={props.cover} size={coverSize} radius={12} />
          ) : (
            <View style={[styles.blank, { width: coverSize, height: coverSize }]}>
              <Icon name={props.eyebrow === "Liked songs" ? "heart.fill" : "music.note.list"} size={coverSize * 0.28} color={theme.muted} />
            </View>
          )}
        </Animated.View>
      </View>
      <Animated.View entering={FadeIn.duration(300)} style={styles.titles}>
        <Text style={[type.eyebrow, { textAlign: "center" }]}>{props.eyebrow}</Text>
        <Text style={[type.title, { textAlign: "center" }]} numberOfLines={3}>
          {props.title}
        </Text>
        {props.artists?.length ? (
          <View style={styles.byline}>
            {props.artists.map((a, i) => (
              <Tap key={`${a.name}:${i}`} onPress={() => props.onArtist?.(a)} disabled={!a.id || !props.onArtist} hitSlop={6}>
                <Text style={[type.body, { color: theme.cream }]}>
                  {a.name}
                  {i < props.artists!.length - 1 ? "," : ""}
                </Text>
              </Tap>
            ))}
          </View>
        ) : props.byline ? (
          <Text style={[type.body, { textAlign: "center", color: theme.muted }]}>{props.byline}</Text>
        ) : null}
        {props.meta ? <Text style={[type.caption, { textAlign: "center", color: theme.faint }]}>{props.meta}</Text> : null}
      </Animated.View>
      <View style={styles.actions}>
        {props.onSave ? <GlassButton icon={props.saved ? "bookmark.fill" : "bookmark"} label={props.saved ? "Remove from library" : "Save to library"} onPress={props.onSave} /> : <View style={{ width: 44 }} />}
        <Pill icon="play.fill" label="Play" primary onPress={props.onPlay} style={{ flex: 1 }} />
        <Pill icon="shuffle" label="Shuffle" onPress={props.onShuffle} style={{ flex: 1 }} />
        {props.onMore ? <GlassButton icon="ellipsis" label="More options" onPress={props.onMore} /> : <View style={{ width: 44 }} />}
      </View>
      {props.description ? (
        <Text style={[type.caption, { paddingHorizontal: space.page, marginBottom: space.l }]} numberOfLines={4}>
          {props.description}
        </Text>
      ) : null}
      {props.loading && !props.songs.length ? <Loading /> : null}
      {props.error && !props.songs.length ? <Message title="Couldn't open this" body={props.error} action="Try again" onAction={props.onRetry} /> : null}
      {!props.loading && !props.error && !props.songs.length && props.empty ? <Message title={props.empty.title} body={props.empty.body} /> : null}
    </View>
  );

  return (
    <Animated.FlatList
      style={{ flex: 1, backgroundColor: theme.night }}
      data={props.songs}
      keyExtractor={(item, i) => `${item.id}:${i}`}
      onScroll={onScroll}
      scrollEventThrottle={16}
      contentInsetAdjustmentBehavior="never"
      ListHeaderComponent={header}
      ListFooterComponent={<View style={{ paddingBottom: 140 }}>{props.footer}</View>}
      onEndReached={props.onEndReached}
      onEndReachedThreshold={0.6}
      renderItem={({ item, index }) =>
        props.renderRow ? (
          (props.renderRow(item, index) as any)
        ) : (
          <SongRow item={item} list={props.songs} source={props.source} index={index} showArt={!props.numbered} />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  coverShadow: { shadowColor: "#000", shadowOpacity: 0.55, shadowRadius: 30, shadowOffset: { width: 0, height: 18 } },
  blank: { borderRadius: 12, backgroundColor: theme.raised, alignItems: "center", justifyContent: "center", borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline },
  titles: { paddingHorizontal: space.xxl, marginTop: space.xxl, gap: 8, alignItems: "center" },
  byline: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 6 },
  actions: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: space.page, marginTop: space.xl, marginBottom: space.l },
});

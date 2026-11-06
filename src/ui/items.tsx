// Rows, cards and shelves: how songs, albums, playlists and artists appear everywhere.

import { memo, useEffect } from "react";
import { FlatList, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming, FadeInDown } from "react-native-reanimated";

import { itemActions, songActions } from "../actions";
import { artistLine, useLiked } from "../lib/store";
import { useOpen, useTab } from "../nav";
import { useQueueSelect } from "../player/queue";
import { radius, space, theme, type } from "../theme";
import type { Item, Section } from "../yt/types";
import { Artwork } from "./Artwork";
import { Icon, Tap } from "./primitives";

const isSong = (item: Item) => item.type === "song" || item.type === "video" || item.type === "episode";

export function subtitleOf(item: Item): string {
  if (isSong(item)) {
    const who = artistLine(item);
    return [item.type === "video" ? "Video" : null, who || item.subtitle].filter(Boolean).join(" · ");
  }
  if (item.type === "artist") return item.subtitle || "Artist";
  return item.subtitle || [item.kind, item.year].filter(Boolean).join(" · ") || (item.type === "album" ? "Album" : "Playlist");
}

export const formatTime = (seconds: number | null | undefined) => {
  if (seconds == null || !Number.isFinite(seconds)) return "";
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${r}` : `${m}:${r}`;
};

/** Three bars dancing beside the song that's playing. */
export function PlayingBars({ playing, color = theme.cream }: { playing: boolean; color?: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 2, height: 14, width: 16 }}>
      {[0, 1, 2].map((i) => (
        <Bar key={i} index={i} playing={playing} color={color} />
      ))}
    </View>
  );
}

function Bar({ index, playing, color }: { index: number; playing: boolean; color: string }) {
  const h = useSharedValue(0.4);
  useEffect(() => {
    if (playing) {
      h.value = withDelay(
        index * 120,
        withRepeat(withSequence(withTiming(1, { duration: 320 + index * 70 }), withTiming(0.25, { duration: 300 + index * 50 })), -1, true),
      );
    } else h.value = withTiming(0.35, { duration: 200 });
  }, [playing, index, h]);
  const style = useAnimatedStyle(() => ({ height: `${h.value * 100}%` }));
  return <Animated.View style={[{ width: 4, borderRadius: 1, backgroundColor: color }, style]} />;
}

// MARK: Rows

type RowProps = { item: Item; list?: Item[]; source?: string; index?: number; showArt?: boolean; onPress?: () => void; onLongPress?: () => void };

function SongRowImpl({ item, list, source, index, showArt = true, onPress, onLongPress }: RowProps) {
  const open = useOpen();
  const tab = useTab();
  const isCurrent = useQueueSelect((s) => s.current?.id === item.id);
  const playing = useQueueSelect((s) => s.current?.id === item.id && (s.player.state === "playing" || s.player.state === "loading"));
  const liked = useLiked(item.id);
  return (
    <Tap
      scale={0.985}
      onPress={onPress ?? (() => open(item, { list, source }))}
      onLongPress={onLongPress ?? (() => songActions(item, tab))}
      delayLongPress={320}
      style={styles.row}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${subtitleOf(item)}`}
    >
      {showArt ? (
        <View>
          <Artwork uri={item.thumbnail} size={52} radius={radius.s} />
          {isCurrent ? (
            <View style={styles.nowOverlay}>
              <PlayingBars playing={playing} />
            </View>
          ) : null}
        </View>
      ) : (
        <View style={styles.number}>
          {isCurrent ? <PlayingBars playing={playing} /> : <Text style={[type.caption, { fontVariant: ["tabular-nums"] }]}>{(index ?? 0) + 1}</Text>}
        </View>
      )}
      <View style={styles.rowText}>
        <Text style={[type.row, isCurrent && { color: theme.cream }]} numberOfLines={1}>
          {item.title}
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
          {item.explicit ? <Icon name="e.square.fill" size={12} color={theme.faint} /> : null}
          {liked ? <Icon name="heart.fill" size={11} color={theme.muted} /> : null}
          <Text style={type.caption} numberOfLines={1}>
            {subtitleOf(item)}
          </Text>
        </View>
      </View>
      <Tap onPress={onLongPress ?? (() => songActions(item, tab))} hitSlop={12} accessibilityLabel="More options" feedback={null}>
        <Icon name="ellipsis" size={18} color={theme.muted} />
      </Tap>
    </Tap>
  );
}

export const SongRow = memo(SongRowImpl);

/** Any item as a full-width row: songs as songs, everything else with its kind beneath. */
export function ItemRow({ item, list, source }: { item: Item; list?: Item[]; source?: string }) {
  const open = useOpen();
  const tab = useTab();
  if (isSong(item)) return <SongRow item={item} list={list} source={source} />;
  return (
    <Tap scale={0.985} onPress={() => open(item)} onLongPress={() => itemActions(item, tab)} style={styles.row}>
      <Artwork uri={item.thumbnail} size={52} radius={radius.s} round={item.type === "artist"} />
      <View style={styles.rowText}>
        <Text style={type.row} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={type.caption} numberOfLines={1}>
          {subtitleOf(item)}
        </Text>
      </View>
      <Icon name="chevron.right" size={13} color={theme.faint} />
    </Tap>
  );
}

// MARK: Cards

export function Card({ item, size = 156, list, source }: { item: Item; size?: number; list?: Item[]; source?: string }) {
  const open = useOpen();
  const tab = useTab();
  const round = item.type === "artist";
  const wide = item.type === "video";
  const width = wide ? size * 1.6 : size;
  return (
    <Tap
      scale={0.96}
      onPress={() => open(item, { list, source })}
      onLongPress={() => itemActions(item, tab)}
      style={{ width }}
      accessibilityRole="button"
      accessibilityLabel={`${item.title}, ${subtitleOf(item)}`}
    >
      <Artwork uri={item.thumbnail} size={width} height={size} radius={round ? undefined : radius.m} round={round} />
      <Text style={[type.itemTitle, { marginTop: 8, textAlign: round ? "center" : "left" }]} numberOfLines={2}>
        {item.title}
      </Text>
      <Text style={[type.caption, { marginTop: 2, textAlign: round ? "center" : "left" }]} numberOfLines={1}>
        {subtitleOf(item)}
      </Text>
    </Tap>
  );
}

// MARK: Shelves

export function ShelfHeader({ title, label, onMore }: { title: string; label?: string | null; onMore?: () => void }) {
  return (
    <View style={styles.shelfHeader}>
      <View style={{ flex: 1 }}>
        {label ? <Text style={[type.eyebrow, { marginBottom: 4 }]}>{label}</Text> : null}
        <Text style={type.section} numberOfLines={1}>
          {title}
        </Text>
      </View>
      {onMore ? (
        <Tap onPress={onMore} hitSlop={10} style={styles.more} accessibilityLabel={`See all ${title}`}>
          <Text style={[type.caption, { color: theme.cream }]}>See all</Text>
          <Icon name="chevron.right" size={11} color={theme.cream} />
        </Tap>
      ) : null}
    </View>
  );
}

/** A shelf of a feed: songs as a paged grid of rows (like Quick picks), the rest as cards. */
export function Shelf({ section, onMore, index = 0 }: { section: Section; onMore?: () => void; index?: number }) {
  const { width } = useWindowDimensions();
  const songs = section.items.filter(isSong);
  const mostlySongs = songs.length >= Math.max(4, section.items.length * 0.7) && !section.items.some((i) => i.type === "video" && !i.album);
  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index, 6) * 70).springify().damping(20)} style={{ marginTop: space.xxl }}>
      <ShelfHeader title={section.title} label={section.label} onMore={onMore} />
      {mostlySongs ? (
        <SongGrid items={songs} width={width} source={section.title} />
      ) : (
        <FlatList
          horizontal
          data={section.items}
          keyExtractor={(item, i) => `${item.type}:${item.id}:${i}`}
          renderItem={({ item }) => <Card item={item} list={section.items} source={section.title} />}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ paddingHorizontal: space.page, gap: 14 }}
          decelerationRate="fast"
          snapToInterval={170}
          snapToAlignment="start"
        />
      )}
    </Animated.View>
  );
}

/** Songs four to a column, columns side by side, paging sideways. */
function SongGrid({ items, width, source }: { items: Item[]; width: number; source: string }) {
  const perColumn = 4;
  const columnWidth = width - space.page * 2 - 28;
  const columns: Item[][] = [];
  for (let i = 0; i < items.length; i += perColumn) columns.push(items.slice(i, i + perColumn));
  return (
    <FlatList
      horizontal
      data={columns}
      keyExtractor={(c, i) => `${c[0]?.id}:${i}`}
      renderItem={({ item: column }) => (
        <View style={{ width: columnWidth }}>
          {column.map((song) => (
            <SongRow key={song.id} item={song} list={items} source={source} />
          ))}
        </View>
      )}
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={{ paddingHorizontal: space.page - 12, gap: 0 }}
      decelerationRate="fast"
      snapToInterval={columnWidth}
      snapToAlignment="start"
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: space.page, paddingVertical: 7, gap: space.m },
  rowText: { flex: 1, gap: 2 },
  number: { width: 28, alignItems: "center" },
  nowOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: radius.s,
    backgroundColor: "rgba(15,14,12,0.55)",
    alignItems: "center",
    justifyContent: "center",
  },
  shelfHeader: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: space.page, marginBottom: space.m, gap: space.m },
  more: { flexDirection: "row", alignItems: "center", gap: 4, paddingBottom: 4 },
});

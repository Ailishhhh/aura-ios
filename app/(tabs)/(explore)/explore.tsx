// Explore: new releases, then every mood and genre YouTube Music offers, as tiles lit by the
// colour YouTube gives each one.

import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { pagePath } from "../../../src/nav";
import { useLoad } from "../../../src/lib/useLoad";
import { radius, space, theme, type } from "../../../src/theme";
import { Card, Shelf, ShelfHeader } from "../../../src/ui/items";
import { Loading, Message, Tap } from "../../../src/ui/primitives";
import { explore, moods } from "../../../src/yt/music";
import type { MoodButton } from "../../../src/yt/types";

/** YouTube's stripe colours are ARGB integers. */
function stripe(color: number | null | undefined): string {
  if (color == null) return "rgba(236,228,214,0.25)";
  const c = color >>> 0;
  const r = (c >> 16) & 255;
  const g = (c >> 8) & 255;
  const b = c & 255;
  return `rgb(${r},${g},${b})`;
}

export default function Explore() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const page = useLoad("explore", () => explore());
  const groups = useLoad("moods", () => moods());
  const tile = (width - space.page * 2 - 12) / 2;

  const openMood = (m: MoodButton) =>
    router.push(pagePath("(explore)", "category", m.browseId ?? "search", { params: m.params ?? undefined, q: m.query, title: m.title }));

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.night }} contentInsetAdjustmentBehavior="automatic" contentContainerStyle={{ paddingTop: insets.top + 70, paddingBottom: 140 }}>
      <View style={{ paddingHorizontal: space.page }}>
        <Text style={type.eyebrow}>New · Moods · Genres</Text>
        <Text style={[type.display, { marginTop: 6 }]}>Explore</Text>
      </View>

      {page.data?.newReleases.length ? (
        <View style={{ marginTop: space.xxl }}>
          <ShelfHeader title="New releases" label="Just out" />
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.page, gap: 14 }}>
            {page.data.newReleases.map((a) => (
              <Card key={a.id} item={a} size={156} />
            ))}
          </ScrollView>
        </View>
      ) : null}

      {groups.loading && !groups.data ? <Loading style={{ marginTop: 40 }} /> : null}
      {groups.error && !groups.data ? <Message title="Nothing to explore yet" action="Try again" onAction={groups.reload} /> : null}

      {(groups.data?.groups ?? []).map((group) => (
        <View key={group.title} style={{ marginTop: space.xxl }}>
          <ShelfHeader title={group.title} />
          <View style={styles.grid}>
            {group.items.map((m, i) => (
              <Animated.View key={`${m.title}:${i}`} entering={FadeInDown.delay(Math.min(i, 10) * 35).springify().damping(20)}>
                <Tap onPress={() => openMood(m)} scale={0.95} style={[styles.tile, { width: tile }]} accessibilityRole="button" accessibilityLabel={m.title}>
                  <LinearGradient colors={[stripe(m.color), theme.raised]} start={{ x: 0, y: 0 }} end={{ x: 0.9, y: 1 }} style={[StyleSheet.absoluteFill, { opacity: 0.55 }]} />
                  <View style={[styles.edge, { backgroundColor: stripe(m.color) }]} />
                  <Text style={[type.itemTitle, { fontSize: 19 }]} numberOfLines={2}>
                    {m.title}
                  </Text>
                </Tap>
              </Animated.View>
            ))}
          </View>
        </View>
      ))}

      {(page.data?.sections ?? []).map((s, i) => (
        <Shelf key={`${s.title}:${i}`} section={s} index={i} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 12, paddingHorizontal: space.page },
  tile: {
    height: 84,
    borderRadius: radius.l,
    backgroundColor: theme.raised,
    overflow: "hidden",
    justifyContent: "flex-end",
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: theme.hairline,
  },
  edge: { position: "absolute", left: 0, top: 0, bottom: 0, width: 4 },
});

// Home: the hour's greeting under tonight's moon, YouTube Music's feed for you, and what you
// played lately. Pull down and the moon rises while the feed refreshes.

import { Image } from "expo-image";
import { router } from "expo-router";
import { useMemo, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { Extrapolation, FadeIn, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { history, recentTracks, useValue } from "../../../src/lib/store";
import { greeting, moonAge, moonName } from "../../../src/lib/sky";
import { useLoad } from "../../../src/lib/useLoad";
import { space, theme, type } from "../../../src/theme";
import { Card, Shelf, ShelfHeader } from "../../../src/ui/items";
import { GlassButton, Loading, Message, Tap, haptic } from "../../../src/ui/primitives";
import { home, more } from "../../../src/yt/music";
import type { Chip, Item, Section } from "../../../src/yt/types";
import { pagePath } from "../../../src/nav";

export default function Home() {
  const insets = useSafeAreaInsets();
  const [chip, setChip] = useState<Chip | null>(null);
  const feed = useLoad(`home:${chip?.params ?? ""}`, (fresh) => home(chip?.params, fresh));
  const [extra, setExtra] = useState<{ sections: Section[]; continuation: string | null } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const plays = useValue(history);
  const recent = useMemo(() => recentTracks(plays, 16), [plays]);

  const sections = [...(feed.data?.sections ?? []), ...(extra?.sections ?? [])];
  const continuation = extra ? extra.continuation : (feed.data?.continuation ?? null);

  const loadMore = async () => {
    if (!continuation || loadingMore) return;
    setLoadingMore(true);
    try {
      const page = await more(continuation);
      setExtra((e) => ({ sections: [...(e?.sections ?? []), ...(page.sections ?? [])], continuation: page.continuation }));
    } catch {
      // Tried again on the next scroll to the end.
    } finally {
      setLoadingMore(false);
    }
  };

  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  const moonStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: interpolate(scrollY.value, [-200, 0, 300], [60, 0, -120], Extrapolation.CLAMP) },
      { scale: interpolate(scrollY.value, [-200, 0], [1.25, 1], Extrapolation.CLAMP) },
    ],
    opacity: interpolate(scrollY.value, [0, 260], [1, 0], Extrapolation.CLAMP),
  }));

  const age = moonAge();
  const today = new Date().toLocaleDateString(undefined, { weekday: "long" });

  return (
    <View style={{ flex: 1, backgroundColor: theme.night }}>
      <Animated.View pointerEvents="none" style={[styles.moon, { top: insets.top - 40 }, moonStyle]}>
        <Image source={require("../../../assets/img/hero_moon.png")} style={{ width: 300, height: 300 }} contentFit="contain" />
      </Animated.View>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentInsetAdjustmentBehavior="automatic"
        refreshControl={
          <RefreshControl
            tintColor={theme.muted}
            refreshing={feed.refreshing}
            onRefresh={() => {
              haptic.soft();
              setExtra(null);
              void feed.refresh();
            }}
          />
        }
        onMomentumScrollEnd={(e) => {
          const { layoutMeasurement, contentOffset, contentSize } = e.nativeEvent;
          if (contentOffset.y + layoutMeasurement.height > contentSize.height - 800) void loadMore();
        }}
        contentContainerStyle={{ paddingTop: insets.top + 8, paddingBottom: 140 }}
      >
        <View style={styles.header}>
          <View style={{ flex: 1 }}>
            <Text style={type.eyebrow}>
              {today} · {moonName(age)}
            </Text>
            <Text style={[type.display, { marginTop: 6 }]}>{greeting()}</Text>
          </View>
          <GlassButton icon="gearshape" label="Settings" onPress={() => router.push("/settings")} />
        </View>

        {feed.data?.chips?.length ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {[{ title: "For you", params: null } as Chip, ...feed.data.chips.filter((c) => !/podcast/i.test(c.title))].map((c) => {
              const active = (chip?.params ?? null) === c.params;
              return (
                <Tap
                  key={c.title}
                  onPress={() => {
                    setExtra(null);
                    setChip(c.params ? c : null);
                  }}
                  style={[styles.chip, active && styles.chipActive]}
                  scale={0.94}
                >
                  <Text style={[type.caption, { color: active ? theme.night : theme.cream, fontWeight: "600" }]}>{c.title}</Text>
                </Tap>
              );
            })}
          </ScrollView>
        ) : null}

        {recent.length >= 3 && !chip ? (
          <Animated.View entering={FadeIn.duration(400)} style={{ marginTop: space.xxl }}>
            <ShelfHeader title="Jump back in" label="Lately" />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space.page, gap: 14 }}>
              {recent.map((t) => {
                const item: Item = { ...t, type: t.type };
                return <Card key={t.id} item={item} size={132} list={recent.map((r) => ({ ...r }) as Item)} source="Your recent plays" />;
              })}
            </ScrollView>
          </Animated.View>
        ) : null}

        {feed.loading && !feed.data ? <Loading style={{ marginTop: 80 }} /> : null}
        {feed.error && !feed.data ? (
          <Message title="The music went quiet" body="YouTube Music didn't answer. Check your connection." action="Try again" onAction={feed.reload} />
        ) : null}

        {sections.map((section, i) => (
          <Shelf
            key={`${section.title}:${i}`}
            section={section}
            index={i}
            onMore={section.more ? () => router.push(pagePath("(home)", "browse", section.more!.browseId, { params: section.more!.params ?? undefined, title: section.title })) : undefined}
          />
        ))}
        {loadingMore ? <Loading /> : null}
      </Animated.ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  moon: { position: "absolute", right: -70, opacity: 1 },
  header: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: space.page, paddingTop: 70, gap: space.m },
  chips: { paddingHorizontal: space.page, gap: 8, marginTop: space.xl },
  chip: { paddingHorizontal: 14, height: 34, borderRadius: 17, justifyContent: "center", backgroundColor: theme.raised, borderWidth: StyleSheet.hairlineWidth, borderColor: theme.hairline },
  chipActive: { backgroundColor: theme.cream },
});

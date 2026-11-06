// Now Playing. The cover sits printed over its own colours, blurred and slowly turning. Tap it for
// the words, double-tap to like, swipe it to skip; it settles back when paused. Up Next and the
// sleep timer are a tap away.

import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { ActionSheetIOS, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  Easing,
  FadeIn,
  FadeOut,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { chooseplaylist } from "../src/actions";
import { LyricsView } from "../src/lyrics/LyricsView";
import { retryLyrics, useLyrics } from "../src/lyrics/lyrics";
import { artistLine, toggleLike, useLiked } from "../src/lib/store";
import { openAlbum, openArtist, share } from "../src/nav";
import { Scrubber } from "../src/player/Scrubber";
import { UpNext } from "../src/player/UpNext";
import { queue, useQueueSelect } from "../src/player/queue";
import { springs, theme, type } from "../src/theme";
import { Artwork } from "../src/ui/Artwork";
import { Icon, Tap, haptic } from "../src/ui/primitives";
import { sized } from "../src/yt/music";
import type { Item } from "../src/yt/types";

type Mode = "cover" | "lyrics" | "queue";

export default function Player() {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  const current = useQueueSelect((s) => s.current);
  const source = useQueueSelect((s) => s.source);
  const error = useQueueSelect((s) => s.error);
  const sleep = useQueueSelect((s) => s.sleep);
  const [mode, setMode] = useState<Mode>("cover");
  const lyricsState = useLyrics();
  const lyricsReady = lyricsState.status === "ready" && lyricsState.trackId === current?.id;

  if (!current) {
    return (
      <View style={[styles.screen, { alignItems: "center", justifyContent: "center" }]}>
        <Text style={type.section}>Nothing playing</Text>
        <Tap onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={[type.body, { color: theme.muted }]}>Close</Text>
        </Tap>
      </View>
    );
  }

  const coverSize = Math.min(width - 56, height * 0.42);
  const item: Item = { ...current, type: current.type };
  const leaveThen = (go: () => void) => {
    router.back();
    setTimeout(go, 380);
  };

  const more = () =>
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: current.title,
        message: artistLine(current),
        options: ["Add to a playlist…", "Start radio from this song", ...(current.artists[0]?.id ? ["Go to artist"] : []), ...(current.album?.id ? ["Go to album"] : []), "Share", "Cancel"],
        cancelButtonIndex: 3 + (current.artists[0]?.id ? 1 : 0) + (current.album?.id ? 1 : 0),
        userInterfaceStyle: "dark",
      },
      (i) => {
        const options = ["playlist", "radio", ...(current.artists[0]?.id ? ["artist"] : []), ...(current.album?.id ? ["album"] : []), "share"];
        switch (options[i]) {
          case "playlist":
            return chooseplaylist([item]);
          case "radio":
            return void queue.playSong(item);
          case "artist":
            return leaveThen(() => openArtist("(home)", current.artists[0].id!));
          case "album":
            return leaveThen(() => openAlbum("(home)", current.album!.id!));
          case "share":
            return share(item);
        }
      },
    );

  const sleepMenu = () => {
    const choices: (number | "song" | null)[] = [null, "song", 15, 30, 45, 60, 90];
    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: "Sleep timer",
        message: "The music fades out, then stops.",
        options: ["Off", current.type === "episode" ? "End of this episode" : "End of this song", "15 minutes", "30 minutes", "45 minutes", "1 hour", "1½ hours", "Cancel"],
        cancelButtonIndex: 7,
        userInterfaceStyle: "dark",
      },
      (i) => {
        if (i < choices.length) {
          haptic.light();
          queue.setSleep(choices[i]);
        }
      },
    );
  };

  return (
    <View style={styles.screen}>
      <Ambient uri={current.thumbnail} />
      <View style={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) }]}>
        <View style={styles.grabber} />
        <View style={styles.header}>
          <Tap onPress={() => router.back()} hitSlop={12} accessibilityLabel="Close the player" style={styles.headerButton}>
            <Icon name="chevron.down" size={20} />
          </Tap>
          <View style={{ flex: 1, alignItems: "center" }}>
            <Text style={type.eyebrow}>Playing from</Text>
            <Text style={[type.caption, { color: theme.cream, marginTop: 2 }]} numberOfLines={1}>
              {source ?? "Your queue"}
            </Text>
          </View>
          <Tap onPress={more} hitSlop={12} accessibilityLabel="More options" style={styles.headerButton}>
            <Icon name="ellipsis" size={20} />
          </Tap>
        </View>

        <View style={styles.stage}>
          {mode === "cover" ? (
            <Animated.View key="cover" entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={styles.center}>
              <Cover item={item} size={coverSize} onTap={() => setMode(lyricsReady ? "lyrics" : "cover")} />
            </Animated.View>
          ) : null}
          {mode === "lyrics" ? (
            <Animated.View key="lyrics" entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ flex: 1, alignSelf: "stretch" }}>
              {lyricsReady && lyricsState.doc ? (
                <LyricsView ttml={lyricsState.doc.ttml} style={{ flex: 1 }} />
              ) : (
                <View style={styles.center}>
                  <Text style={[type.section, { color: theme.muted }]}>
                    {lyricsState.status === "loading" ? "Finding the words…" : lyricsState.status === "failed" ? "Couldn't load the words" : "No lyrics for this one"}
                  </Text>
                  {lyricsState.status === "failed" ? (
                    <Tap onPress={retryLyrics} style={{ marginTop: 12 }}>
                      <Text style={[type.body, { color: theme.cream }]}>Try again</Text>
                    </Tap>
                  ) : null}
                </View>
              )}
              {lyricsReady && lyricsState.doc?.source ? <Text style={[type.fine, { textAlign: "center", marginBottom: 6 }]}>Lyrics from {lyricsState.doc.source}</Text> : null}
            </Animated.View>
          ) : null}
          {mode === "queue" ? (
            <Animated.View key="queue" entering={FadeIn.duration(250)} exiting={FadeOut.duration(150)} style={{ flex: 1, alignSelf: "stretch", paddingHorizontal: 28, paddingTop: 8 }}>
              <UpNext />
            </Animated.View>
          ) : null}
        </View>

        <View style={styles.lower}>
          <TitleRow item={item} compact={mode !== "cover"} />
          <Scrubber width={width - 56} />
          <Controls />
          <Text style={[type.fine, { textAlign: "center", minHeight: 16, color: error ? theme.heart : theme.faint }]} numberOfLines={1}>
            {error ?? sleepLabel(sleep)}
          </Text>
          <View style={styles.footer}>
            <FooterButton icon={sleep ? "moon.zzz.fill" : "moon.zzz"} label="Sleep timer" active={!!sleep} onPress={sleepMenu} />
            <FooterButton icon={mode === "lyrics" ? "quote.bubble.fill" : "quote.bubble"} label="Lyrics" active={mode === "lyrics"} dim={!lyricsReady && mode !== "lyrics"} onPress={() => setMode(mode === "lyrics" ? "cover" : "lyrics")} />
            <FooterButton icon="list.bullet" label="Up next" active={mode === "queue"} onPress={() => setMode(mode === "queue" ? "cover" : "queue")} />
          </View>
        </View>
      </View>
    </View>
  );
}

function sleepLabel(sleep: ReturnType<typeof queue.snapshot>["sleep"]) {
  if (!sleep) return "";
  if (sleep.kind === "song") return "Stopping at the end of this song";
  const left = Math.max(0, Math.round((sleep.at - Date.now()) / 60000));
  return `Stopping in ${left} minute${left === 1 ? "" : "s"}`;
}

/** The cover's own colours, blurred and slowly turning, behind everything. */
function Ambient({ uri }: { uri: string | null }) {
  const { width, height } = useWindowDimensions();
  const turn = useSharedValue(0);
  useEffect(() => {
    turn.value = withRepeat(withTiming(1, { duration: 90_000, easing: Easing.linear }), -1, false);
  }, [turn]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${turn.value * 360}deg` }, { scale: 1.9 }] }));
  const side = Math.max(width, height);
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Animated.View style={[{ position: "absolute", width: side, height: side, left: (width - side) / 2, top: (height - side) / 2 }, spin]}>
        {uri ? <Image source={{ uri: sized(uri, 160) ?? undefined }} style={{ width: side, height: side }} blurRadius={60} contentFit="cover" transition={700} /> : null}
      </Animated.View>
      <LinearGradient colors={["rgba(15,14,12,0.45)", "rgba(15,14,12,0.6)", "rgba(15,14,12,0.88)"]} locations={[0, 0.45, 1]} style={StyleSheet.absoluteFill} />
    </View>
  );
}

function Cover({ item, size, onTap }: { item: Item; size: number; onTap: () => void }) {
  const playing = useQueueSelect((s) => s.player.state === "playing" || s.player.state === "loading" || s.player.intendsToPlay);
  const scale = useSharedValue(1);
  const shift = useSharedValue(0);
  const heart = useSharedValue(0);

  useEffect(() => {
    scale.value = withSpring(playing ? 1 : 0.84, springs.soft);
  }, [playing, scale]);

  const like = () => {
    haptic.success();
    toggleLike(item, true);
  };
  const skip = (direction: number) => {
    haptic.light();
    void (direction < 0 ? queue.next() : queue.previous());
  };

  const pan = Gesture.Pan()
    .activeOffsetX([-12, 12])
    .failOffsetY([-14, 14])
    .onUpdate((e) => {
      shift.value = e.translationX * 0.45;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 120 || Math.abs(e.velocityX) > 900) runOnJS(skip)(e.translationX);
      shift.value = withSpring(0, springs.press);
    });
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      heart.value = withSequence(withSpring(1, { damping: 9, stiffness: 260 }), withTiming(1, { duration: 350 }), withTiming(0, { duration: 260 }));
      runOnJS(like)();
    });
  const singleTap = Gesture.Tap().onEnd(() => runOnJS(onTap)());
  const gesture = Gesture.Simultaneous(pan, Gesture.Exclusive(doubleTap, singleTap));

  const coverStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shift.value }, { scale: scale.value }, { rotate: `${shift.value / 40}deg` }],
  }));
  const heartStyle = useAnimatedStyle(() => ({ opacity: heart.value, transform: [{ scale: 0.6 + heart.value * 0.6 }] }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.coverShadow, coverStyle]} accessibilityLabel={`Cover of ${item.title}. Tap for lyrics, double-tap to like.`}>
        <Artwork uri={item.thumbnail} size={size} radius={14} />
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, { alignItems: "center", justifyContent: "center" }, heartStyle]}>
          <Icon name="heart.fill" size={size * 0.3} color={theme.cream} />
        </Animated.View>
      </Animated.View>
    </GestureDetector>
  );
}

function TitleRow({ item, compact }: { item: Item; compact: boolean }) {
  const liked = useLiked(item.id);
  const beat = useSharedValue(1);
  const beatStyle = useAnimatedStyle(() => ({ transform: [{ scale: beat.value }] }));
  return (
    <View style={styles.titleRow}>
      <View style={{ flex: 1 }}>
        <Text style={[type.title, { fontSize: compact ? 24 : 30, lineHeight: compact ? 28 : 34 }]} numberOfLines={1}>
          {item.title || "Loading…"}
        </Text>
        <Tap
          onPress={() => {
            const artist = item.artists?.[0];
            if (!artist?.id) return;
            router.back();
            setTimeout(() => openArtist("(home)", artist.id!), 380);
          }}
          feedback={null}
          scale={0.98}
        >
          <Text style={[type.body, { color: theme.muted, marginTop: 2 }]} numberOfLines={1}>
            {artistLine(item)}
          </Text>
        </Tap>
      </View>
      <Tap
        onPress={() => {
          beat.value = withSequence(withSpring(1.3, { damping: 8, stiffness: 400 }), withSpring(1, springs.press));
          if (!liked) haptic.success();
          toggleLike(item);
        }}
        hitSlop={12}
        feedback={liked ? "tap" : null}
        accessibilityLabel={liked ? "Remove from Liked Songs" : "Add to Liked Songs"}
      >
        <Animated.View style={beatStyle}>
          <Icon name={liked ? "heart.fill" : "heart"} size={24} color={liked ? theme.heart : theme.cream} />
        </Animated.View>
      </Tap>
    </View>
  );
}

function Controls() {
  const playing = useQueueSelect((s) => s.player.intendsToPlay || s.player.state === "playing");
  const busy = useQueueSelect((s) => s.preparing || s.player.state === "loading");
  const shuffle = useQueueSelect((s) => s.shuffle);
  const repeat = useQueueSelect((s) => s.repeat);
  return (
    <View style={styles.controls}>
      <Tap onPress={() => queue.toggleShuffle()} hitSlop={10} scale={0.85} accessibilityLabel="Shuffle">
        <Icon name="shuffle" size={20} color={shuffle ? theme.cream : theme.faint} />
      </Tap>
      <Tap onPress={() => void queue.previous()} hitSlop={10} scale={0.85} feedback="light" accessibilityLabel="Previous">
        <Icon name="backward.fill" size={34} />
      </Tap>
      <Tap onPress={() => void queue.toggle()} scale={0.88} feedback="firm" accessibilityLabel={playing ? "Pause" : "Play"}>
        <View style={styles.play}>
          {busy && !playing ? <Breathing /> : <Icon name={playing ? "pause.fill" : "play.fill"} size={34} color={theme.night} />}
        </View>
      </Tap>
      <Tap onPress={() => void queue.next()} hitSlop={10} scale={0.85} feedback="light" accessibilityLabel="Next">
        <Icon name="forward.fill" size={34} />
      </Tap>
      <Tap onPress={() => queue.cycleRepeat()} hitSlop={10} scale={0.85} accessibilityLabel={`Repeat: ${repeat}`}>
        <Icon name={repeat === "one" ? "repeat.1" : "repeat"} size={20} color={repeat === "off" ? theme.faint : theme.cream} />
      </Tap>
    </View>
  );
}

/** The play button breathing while a song is found. */
function Breathing() {
  const v = useSharedValue(0.4);
  useEffect(() => {
    v.value = withRepeat(withTiming(1, { duration: 700, easing: Easing.inOut(Easing.quad) }), -1, true);
  }, [v]);
  const style = useAnimatedStyle(() => ({ opacity: v.value, transform: [{ scale: 0.7 + v.value * 0.3 }] }));
  return <Animated.View style={[{ width: 18, height: 18, borderRadius: 9, backgroundColor: theme.night }, style]} />;
}

function FooterButton({ icon, label, active, dim, onPress }: { icon: any; label: string; active?: boolean; dim?: boolean; onPress: () => void }) {
  return (
    <Tap onPress={onPress} hitSlop={10} scale={0.88} accessibilityLabel={label} style={[styles.footerButton, active && styles.footerActive]}>
      <Icon name={icon} size={19} color={active ? theme.night : dim ? theme.faint : theme.cream} />
    </Tap>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.night },
  content: { flex: 1, paddingTop: 8 },
  grabber: { alignSelf: "center", width: 38, height: 5, borderRadius: 3, backgroundColor: "rgba(236,228,214,0.3)", marginBottom: 6 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, gap: 8 },
  headerButton: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  stage: { flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  coverShadow: { shadowColor: "#000", shadowOpacity: 0.6, shadowRadius: 34, shadowOffset: { width: 0, height: 22 } },
  lower: { paddingHorizontal: 28, gap: 14 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 4 },
  play: { width: 76, height: 76, borderRadius: 38, backgroundColor: theme.cream, alignItems: "center", justifyContent: "center" },
  footer: { flexDirection: "row", justifyContent: "space-around", marginTop: 2 },
  footerButton: { width: 44, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
  footerActive: { backgroundColor: theme.cream },
});

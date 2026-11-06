// The song playing, docked above the tab bar. On iOS 26 it lives in the tab bar's own glass
// accessory (and shrinks inline when the bar minimises on scroll), like Apple Music; on older
// iPhones it floats as a glass capsule.

import { router } from "expo-router";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { artistLine } from "../lib/store";
import { springs, theme, type } from "../theme";
import { Artwork } from "../ui/Artwork";
import { Glass, Icon, Tap, haptic } from "../ui/primitives";
import { queue, useQueueSelect } from "./queue";

const openPlayer = () => router.push("/player");

export function MiniPlayerContent({ inline }: { inline?: boolean }) {
  const current = useQueueSelect((s) => s.current);
  const busy = useQueueSelect((s) => s.player.state === "loading" || s.preparing);
  const playing = useQueueSelect((s) => s.player.intendsToPlay || s.player.state === "playing");
  const error = useQueueSelect((s) => s.error);
  const progress = useQueueSelect((s) => (s.player.duration ? Math.min(1, s.player.position / s.player.duration) : 0));

  // Swipe the song sideways to skip, as on Android.
  const shift = useSharedValue(0);
  const swipe = Gesture.Pan()
    .activeOffsetX([-14, 14])
    .failOffsetY([-10, 10])
    .onUpdate((e) => {
      shift.value = e.translationX * 0.6;
    })
    .onEnd((e) => {
      if (Math.abs(e.translationX) > 70) {
        runOnJS(haptic.light)();
        runOnJS(e.translationX < 0 ? skipNext : skipPrevious)();
      }
      shift.value = withSpring(0, springs.press);
    });
  const moving = useAnimatedStyle(() => ({ transform: [{ translateX: shift.value }], opacity: 1 - Math.min(0.6, Math.abs(shift.value) / 160) }));

  if (!current) {
    return (
      <View style={[styles.row, styles.empty]}>
        <Icon name="music.note" size={16} color={theme.faint} />
        <Text style={[type.caption, { color: theme.faint }]}>Nothing playing</Text>
      </View>
    );
  }

  return (
    <GestureDetector gesture={swipe}>
      <View style={styles.row}>
        <Tap onPress={openPlayer} scale={0.98} feedback="light" style={styles.main} accessibilityLabel={`Now playing: ${current.title}. Open the player.`}>
          <Animated.View style={[styles.main, moving]}>
            <Artwork uri={current.thumbnail} size={inline ? 28 : 36} radius={inline ? 6 : 8} />
            <View style={{ flex: 1 }}>
              <Text style={[type.body, { fontSize: 14 }]} numberOfLines={1}>
                {current.title || "Loading…"}
              </Text>
              {!inline ? (
                <Text style={[type.caption, { fontSize: 12 }]} numberOfLines={1}>
                  {error ?? artistLine(current)}
                </Text>
              ) : null}
            </View>
          </Animated.View>
        </Tap>
        <Tap onPress={() => void queue.toggle()} hitSlop={10} scale={0.85} accessibilityLabel={playing ? "Pause" : "Play"}>
          <View style={styles.button}>{busy && !playing ? <Icon name="ellipsis" size={20} /> : <Icon name={playing ? "pause.fill" : "play.fill"} size={22} />}</View>
        </Tap>
        {!inline ? (
          <Tap onPress={() => void queue.next()} hitSlop={10} scale={0.85} accessibilityLabel="Next song">
            <View style={styles.button}>
              <Icon name="forward.fill" size={20} />
            </View>
          </Tap>
        ) : null}
        <View style={[styles.progress, { width: `${progress * 100}%` }]} />
      </View>
    </GestureDetector>
  );
}

const skipNext = () => void queue.next();
const skipPrevious = () => void queue.previous();

/** For iPhones without iOS 26: a glass capsule floating above the classic tab bar. */
export function FloatingMiniPlayer() {
  const insets = useSafeAreaInsets();
  const hasSong = useQueueSelect((s) => s.current != null);
  if (!hasSong) return null;
  return (
    <View pointerEvents="box-none" style={[StyleSheet.absoluteFill, { justifyContent: "flex-end", paddingBottom: insets.bottom + 49 + 8, paddingHorizontal: 10 }]}>
      <Glass interactive style={styles.floating}>
        <MiniPlayerContent />
      </Glass>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flex: 1, flexDirection: "row", alignItems: "center", paddingLeft: 10, paddingRight: 8, gap: 4, overflow: "hidden" },
  empty: { gap: 8, justifyContent: "center" },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  button: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  progress: { position: "absolute", left: 18, bottom: 0, height: 1.5, borderRadius: 1, backgroundColor: "rgba(236,228,214,0.5)" },
  floating: { height: 58, borderRadius: 29 },
});

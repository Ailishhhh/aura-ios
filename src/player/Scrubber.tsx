// The seek bar: a hairline that thickens under your finger, with the time beside it.

import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withSpring, withTiming } from "react-native-reanimated";

import { springs, theme, type } from "../theme";
import { formatTime } from "../ui/items";
import { haptic } from "../ui/primitives";
import { queue, useQueueSelect } from "./queue";

export function Scrubber({ width }: { width: number }) {
  const position = useQueueSelect((s) => s.player.position);
  const duration = useQueueSelect((s) => s.player.duration ?? s.current?.duration ?? 0);
  const [dragging, setDragging] = useState<number | null>(null);
  const grip = useSharedValue(0);
  const fraction = useSharedValue(0);

  useEffect(() => {
    if (dragging == null) fraction.value = withTiming(duration ? Math.min(1, position / duration) : 0, { duration: 250 });
  }, [position, duration, dragging, fraction]);

  const seekTo = (f: number) => {
    setDragging(null);
    haptic.light();
    void queue.seek(f * duration);
  };

  const pan = Gesture.Pan()
    .minDistance(0)
    .onBegin((e) => {
      grip.value = withSpring(1, springs.press);
      fraction.value = Math.min(1, Math.max(0, e.x / width));
      runOnJS(setDragging)(fraction.value);
    })
    .onUpdate((e) => {
      fraction.value = Math.min(1, Math.max(0, e.x / width));
      runOnJS(setDragging)(fraction.value);
    })
    .onEnd(() => {
      runOnJS(seekTo)(fraction.value);
    })
    .onFinalize(() => {
      grip.value = withSpring(0, springs.press);
    });

  const track = useAnimatedStyle(() => ({ height: 4 + grip.value * 6, borderRadius: 2 + grip.value * 3 }));
  const fill = useAnimatedStyle(() => ({ width: fraction.value * width }));

  const shown = dragging != null ? dragging * duration : position;
  return (
    <View>
      <GestureDetector gesture={pan}>
        <View style={styles.hit}>
          <Animated.View style={[styles.track, { width }, track]}>
            <Animated.View style={[styles.fill, fill]} />
          </Animated.View>
        </View>
      </GestureDetector>
      <View style={styles.times}>
        <Text style={[type.fine, styles.time, dragging != null && { color: theme.cream }]}>{formatTime(shown)}</Text>
        <Text style={[type.fine, styles.time]}>-{formatTime(Math.max(0, duration - shown))}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  hit: { height: 28, justifyContent: "center" },
  track: { backgroundColor: "rgba(236,228,214,0.18)", overflow: "hidden" },
  fill: { height: "100%", backgroundColor: theme.cream },
  times: { flexDirection: "row", justifyContent: "space-between", marginTop: 2 },
  time: { fontVariant: ["tabular-nums"], color: theme.muted },
});

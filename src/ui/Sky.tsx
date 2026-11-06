// The welcome sky (the Android app's ui/components/Cosmos.kt): square "pixel" stars that twinkle
// and drift, and now and then a meteor.

import { Canvas, Group, Rect, useClock } from "@shopify/react-native-skia";
import { useMemo } from "react";
import { StyleSheet, useWindowDimensions } from "react-native";
import { useDerivedValue } from "react-native-reanimated";

import { theme } from "../theme";

type Star = { x: number; y: number; size: number; phase: number; speed: number; drift: number };

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 16807) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

export function Starfield({ count = 120 }: { count?: number }) {
  const { width, height } = useWindowDimensions();
  const clock = useClock();
  const stars = useMemo<Star[]>(() => {
    const random = seeded(7);
    return Array.from({ length: count }, () => {
      const size = random() < 0.85 ? 1.5 : 2.5;
      return { x: random() * width, y: random() * height * 0.75, size, phase: random() * Math.PI * 2, speed: 0.6 + random() * 1.6, drift: size * 1.2 };
    });
  }, [count, width, height]);

  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      {stars.map((star, i) => (
        <Twinkle key={i} star={star} clock={clock} width={width} />
      ))}
      <Meteor clock={clock} width={width} height={height} />
    </Canvas>
  );
}

function Twinkle({ star, clock, width }: { star: Star; clock: ReturnType<typeof useClock>; width: number }) {
  const opacity = useDerivedValue(() => 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(clock.value / 1000 * star.speed + star.phase)));
  const x = useDerivedValue(() => (star.x + (clock.value / 1000) * star.drift) % width);
  return <Rect x={x} y={star.y} width={star.size} height={star.size} color={theme.cream} opacity={opacity} />;
}

/** Every nine seconds, a short tail of dots crosses the upper sky. */
function Meteor({ clock, width, height }: { clock: ReturnType<typeof useClock>; width: number; height: number }) {
  const progress = useDerivedValue(() => {
    const t = (clock.value / 1000) % 9;
    return t < 1.1 ? t / 1.1 : -1;
  });
  const transform = useDerivedValue(() => {
    const p = progress.value;
    return [{ translateX: width * (0.15 + p * 0.6) }, { translateY: height * (0.08 + p * 0.18) }];
  });
  const opacity = useDerivedValue(() => (progress.value < 0 ? 0 : Math.sin(progress.value * Math.PI)));
  return (
    <Group transform={transform} opacity={opacity}>
      {Array.from({ length: 14 }, (_, i) => (
        <Rect key={i} x={-i * 7} y={-i * 2.2} width={2} height={2} color={theme.cream} opacity={1 - i / 14} />
      ))}
    </Group>
  );
}

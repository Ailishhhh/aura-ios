// Every cover in Aura goes through here: printed in the chosen dither, in monochrome, or as the
// artist made it (Settings → Artwork), as on Android.

import { Canvas, Fill, Group, ImageShader, Shader, Skia, SkImage, useImage } from "@shopify/react-native-skia";
import { Image } from "expo-image";
import { memo, useEffect, useState } from "react";
import { PixelRatio, StyleProp, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { settings, useValue } from "../lib/store";
import { grainPoints, theme } from "../theme";
import { sized } from "../yt/music";
import { DITHER_LEVELS, LIGHT, SHADOW, ditherEffect } from "./dither";

type Props = {
  uri: string | null | undefined;
  size: number;
  /** Height when not square. */
  height?: number;
  radius?: number;
  round?: boolean;
  style?: StyleProp<ViewStyle>;
  /** Ignore the setting and show real colours (the blurred backdrop behind the player). */
  original?: boolean;
};

// Decoded covers, so scrolling back doesn't fetch them again.
const images = new Map<string, Promise<SkImage | null>>();

function loadImage(url: string): Promise<SkImage | null> {
  let pending = images.get(url);
  if (!pending) {
    pending = Skia.Data.fromURI(url)
      .then((data) => Skia.Image.MakeImageFromEncoded(data))
      .catch(() => null);
    images.set(url, pending);
    if (images.size > 160) images.delete(images.keys().next().value as string);
    pending.then((image) => {
      if (!image) images.delete(url);
    });
  }
  return pending;
}

function useCover(url: string | null): SkImage | null {
  const [image, setImage] = useState<SkImage | null>(null);
  useEffect(() => {
    let live = true;
    setImage(null);
    if (url) void loadImage(url).then((img) => live && setImage(img));
    return () => {
      live = false;
    };
  }, [url]);
  return image;
}

function ArtworkImpl({ uri, size, height, radius = 8, round, style, original }: Props) {
  const look = useValue(settings, (s) => `${s.dither ? s.style : "off"}|${s.grain}|${s.originalColors}`);
  const [style_, grain, originalColors] = look.split("|");
  const width = size;
  const h = height ?? size;
  const corner = round ? Math.min(width, h) / 2 : radius;
  const px = Math.min(1200, Math.round(Math.max(width, h) * PixelRatio.get()));
  const url = sized(uri, px);
  const plain = original || (style_ === "off" && originalColors === "true");

  const frame: StyleProp<ViewStyle> = [{ width, height: h, borderRadius: corner, overflow: "hidden", backgroundColor: theme.raised }, style];

  if (plain || !url) {
    return (
      <View style={frame}>
        {url ? <Image source={{ uri: url }} style={{ width, height: h }} contentFit="cover" transition={280} recyclingKey={url} /> : null}
      </View>
    );
  }
  return (
    <View style={frame}>
      <Printed url={url} width={width} height={h} styleName={style_ === "off" ? "mono" : (style_ as any)} grain={grain as any} />
    </View>
  );
}

function Printed({
  url,
  width,
  height,
  styleName,
  grain,
}: {
  url: string;
  width: number;
  height: number;
  styleName: "noise" | "bayer" | "halftone" | "lines" | "mono";
  grain: "fine" | "medium" | "coarse";
}) {
  const image = useCover(url);
  const noise = useImage(require("../../assets/img/blue_noise.png"));
  const effect = ditherEffect(styleName);
  const opacity = useSharedValue(0);
  useEffect(() => {
    opacity.value = image ? withTiming(1, { duration: 320 }) : 0;
  }, [image, opacity]);
  const fade = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const needsNoise = styleName === "noise";
  if (!effect || !image || (needsNoise && !noise)) return null;
  return (
    <Animated.View style={[{ width, height }, fade]}>
      <Canvas style={{ width, height }}>
        <Group>
          <Fill>
            <Shader
              source={effect}
              uniforms={{ grain: grainPoints(grain), levels: DITHER_LEVELS, shadow: SHADOW, light: LIGHT }}
            >
              <ImageShader image={image} fit="cover" rect={{ x: 0, y: 0, width, height }} />
              {needsNoise && noise ? <ImageShader image={noise} tx="repeat" ty="repeat" /> : null}
            </Shader>
          </Fill>
        </Group>
      </Canvas>
    </Animated.View>
  );
}

export const Artwork = memo(ArtworkImpl);

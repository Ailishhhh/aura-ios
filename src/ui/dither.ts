// The Android app's artwork shaders (ui/components/Dither.kt), in SkSL for React Native Skia.
// Every style samples the image once per cell, reduces it to a tone, and prints that tone as a mix
// of shadow and light. Coordinates are local to the image, so the pattern doesn't crawl on scroll.

import { Skia, SkRuntimeEffect } from "@shopify/react-native-skia";

import type { DitherStyle } from "../lib/store";

const COMMON = `
uniform shader image;
uniform float grain;
uniform float levels;
uniform float3 shadow;
uniform float3 light;

half tone(half3 rgb) {
  return smoothstep(0.03, 0.97, dot(rgb, half3(0.299, 0.587, 0.114)));
}

half4 ink(half q, half a) {
  return half4(mix(half3(shadow), half3(light), q) * a, a);
}
`;

const NOISE = `${COMMON}
uniform shader noise;

half4 main(float2 p) {
  float2 cell = floor(p / grain);
  half4 src = image.eval((cell + 0.5) * grain);
  if (src.a < 0.004) return half4(0.0);
  half t = tone(src.rgb / src.a);
  half steps = levels - 1.0;
  half q = clamp(floor(t * steps + noise.eval(cell + 0.5).r) / steps, 0.0, 1.0);
  return ink(q, src.a);
}
`;

const BAYER = `${COMMON}
float bayer2(float2 a) {
  a = floor(a);
  return fract(a.x / 2.0 + a.y * a.y * 0.75);
}
float bayer4(float2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
float bayer8(float2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }

half4 main(float2 p) {
  float2 cell = floor(p / grain);
  half4 src = image.eval((cell + 0.5) * grain);
  if (src.a < 0.004) return half4(0.0);
  half t = tone(src.rgb / src.a);
  half steps = levels - 1.0;
  half threshold = half(bayer8(cell)) + 1.0 / 128.0;
  half q = clamp(floor(t * steps + threshold) / steps, 0.0, 1.0);
  return ink(q, src.a);
}
`;

const HALFTONE = `${COMMON}
half4 main(float2 p) {
  float size = grain * 2.6;
  float2x2 rot = float2x2(0.7071, -0.7071, 0.7071, 0.7071);
  float2x2 unrot = float2x2(0.7071, 0.7071, -0.7071, 0.7071);
  float2 q = rot * p / size;
  float2 center = floor(q) + 0.5;
  half4 src = image.eval(unrot * center * size);
  if (src.a < 0.004) return half4(0.0);
  half t = tone(src.rgb / src.a);
  float r = sqrt(t) * 0.7071 * size;
  float d = length(q - center) * size;
  half cover = half(1.0 - smoothstep(r - 0.75 * grain, r + 0.75 * grain, d));
  return ink(cover, src.a);
}
`;

const LINES = `${COMMON}
half4 main(float2 p) {
  float period = grain * 2.2;
  float row = floor(p.y / period);
  float x = (floor(p.x / grain) + 0.5) * grain;
  half4 src = image.eval(float2(x, (row + 0.5) * period));
  if (src.a < 0.004) return half4(0.0);
  half t = tone(src.rgb / src.a);
  float halfWidth = t * period * 0.5;
  float d = abs(p.y - (row + 0.5) * period);
  half cover = half(1.0 - smoothstep(halfWidth - 0.6 * grain, halfWidth + 0.6 * grain, d));
  return ink(cover, src.a);
}
`;

/** When dithering is off: the same shadow-to-light ramp, smooth. */
const MONO = `${COMMON}
half4 main(float2 p) {
  half4 src = image.eval(p);
  if (src.a < 0.004) return half4(0.0);
  return ink(tone(src.rgb / src.a), src.a);
}
`;

const SOURCES: Record<DitherStyle | "mono", string> = {
  noise: NOISE,
  bayer: BAYER,
  halftone: HALFTONE,
  lines: LINES,
  mono: MONO,
};

const compiled = new Map<string, SkRuntimeEffect | null>();

export function ditherEffect(style: DitherStyle | "mono"): SkRuntimeEffect | null {
  if (!compiled.has(style)) compiled.set(style, Skia.RuntimeEffect.Make(SOURCES[style]));
  return compiled.get(style) ?? null;
}

const rgb = (hex: string): [number, number, number] => [
  parseInt(hex.slice(1, 3), 16) / 255,
  parseInt(hex.slice(3, 5), 16) / 255,
  parseInt(hex.slice(5, 7), 16) / 255,
];

export const SHADOW = rgb("#1A1816");
export const LIGHT = rgb("#DDD3C2");
export const DITHER_LEVELS = 3;

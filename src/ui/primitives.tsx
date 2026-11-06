// Small building blocks used on every screen.

import { BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import * as Haptics from "expo-haptics";
import { SymbolView, SFSymbol } from "expo-symbols";
import { ReactNode } from "react";
import { ActivityIndicator, Pressable, PressableProps, StyleProp, StyleSheet, Text, TextProps, View, ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from "react-native-reanimated";

import { settings } from "../lib/store";
import { radius, springs, theme, type } from "../theme";

export const liquidGlass = isLiquidGlassAvailable();

// MARK: Haptics

export const haptic = {
  tap: () => settings.get().haptics && void Haptics.selectionAsync(),
  light: () => settings.get().haptics && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
  soft: () => settings.get().haptics && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Soft),
  firm: () => settings.get().haptics && void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium),
  success: () => settings.get().haptics && void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success),
};

// MARK: Pressing

type TapProps = Omit<PressableProps, "style"> & {
  style?: StyleProp<ViewStyle>;
  /** How far it sinks while held. */
  scale?: number;
  feedback?: keyof typeof haptic | null;
  children?: ReactNode;
};

/** A pressable that sinks a little under the finger, with a tick of haptics. */
export function Tap({ style, scale = 0.96, feedback = "tap", onPress, onPressIn, onPressOut, children, ...rest }: TapProps) {
  const pressed = useSharedValue(1);
  const animated = useAnimatedStyle(() => ({ transform: [{ scale: pressed.value }] }));
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        pressed.value = withSpring(scale, springs.press);
        onPressIn?.(e);
      }}
      onPressOut={(e) => {
        pressed.value = withSpring(1, springs.press);
        onPressOut?.(e);
      }}
      onPress={(e) => {
        if (feedback) haptic[feedback]();
        onPress?.(e);
      }}
    >
      <Animated.View style={[style, animated]}>{children}</Animated.View>
    </Pressable>
  );
}

// MARK: Icons

export function Icon({ name, size = 22, color = theme.cream, weight }: { name: SFSymbol; size?: number; color?: string; weight?: "regular" | "medium" | "semibold" | "bold" }) {
  return <SymbolView name={name} size={size} tintColor={color} weight={weight} resizeMode="scaleAspectFit" style={{ width: size, height: size }} />;
}

// MARK: Glass

/** iOS 26 Liquid Glass where the phone has it; a dark frosted pane where it doesn't. */
export function Glass({ style, children, interactive, tint }: { style?: StyleProp<ViewStyle>; children?: ReactNode; interactive?: boolean; tint?: string }) {
  if (liquidGlass) {
    return (
      <GlassView style={style} glassEffectStyle="regular" colorScheme="dark" isInteractive={interactive} tintColor={tint}>
        {children}
      </GlassView>
    );
  }
  return (
    <View style={[style, { overflow: "hidden" }]}>
      <BlurView tint="systemThinMaterialDark" intensity={60} style={StyleSheet.absoluteFill} />
      <View style={[StyleSheet.absoluteFill, { backgroundColor: tint ?? "rgba(32, 29, 26, 0.35)", borderColor: theme.hairline, borderWidth: StyleSheet.hairlineWidth, borderRadius: (StyleSheet.flatten(style)?.borderRadius as number) ?? 0 }]} />
      {children}
    </View>
  );
}

/** A round glass button with an SF Symbol. */
export function GlassButton({ icon, onPress, size = 44, iconSize, label, tint }: { icon: SFSymbol; onPress?: () => void; size?: number; iconSize?: number; label: string; tint?: string }) {
  return (
    <Tap onPress={onPress} accessibilityLabel={label} accessibilityRole="button" scale={0.9}>
      <Glass interactive style={{ width: size, height: size, borderRadius: size / 2, alignItems: "center", justifyContent: "center" }} tint={tint}>
        <Icon name={icon} size={iconSize ?? size * 0.42} />
      </Glass>
    </Tap>
  );
}

/** A capsule button: a big round Play, or Shuffle and Save beside it. */
export function Pill({ icon, label, onPress, primary, style }: { icon?: SFSymbol; label: string; onPress?: () => void; primary?: boolean; style?: StyleProp<ViewStyle> }) {
  const content = (
    <>
      {icon ? <Icon name={icon} size={17} color={primary ? theme.night : theme.cream} weight="semibold" /> : null}
      <Text style={[type.button, primary && { color: theme.night }]}>{label}</Text>
    </>
  );
  return (
    <Tap onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={style} feedback="light">
      {primary ? (
        <View style={[styles.pill, { backgroundColor: theme.cream }]}>{content}</View>
      ) : (
        <Glass interactive style={styles.pill}>
          {content}
        </Glass>
      )}
    </Tap>
  );
}

// MARK: Text

export function Eyebrow(props: TextProps) {
  return <Text {...props} style={[type.eyebrow, props.style]} />;
}

export function Loading({ style }: { style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ paddingVertical: 48, alignItems: "center" }, style]}>
      <ActivityIndicator color={theme.muted} />
    </View>
  );
}

/** A quiet, centred message: an empty shelf, or an error with a way to try again. */
export function Message({ title, body, action, onAction }: { title: string; body?: string; action?: string; onAction?: () => void }) {
  return (
    <View style={{ paddingVertical: 64, paddingHorizontal: 32, alignItems: "center", gap: 8 }}>
      <Text style={[type.section, { textAlign: "center" }]}>{title}</Text>
      {body ? <Text style={[type.caption, { textAlign: "center" }]}>{body}</Text> : null}
      {action ? <Pill label={action} onPress={onAction} style={{ marginTop: 12 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    height: 46,
    paddingHorizontal: 20,
    borderRadius: radius.pill,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
});

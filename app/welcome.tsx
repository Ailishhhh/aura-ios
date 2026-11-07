// The first thing you see: a moonrise over a sky of pixel stars, as on Android. Sign in to bring
// your YouTube Music library, or just start listening.

import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, { Easing, FadeIn, FadeInDown, useAnimatedStyle, useSharedValue, withDelay, withRepeat, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { welcome } from "../src/lib/store";
import { space, theme, type } from "../src/theme";
import { Starfield } from "../src/ui/Sky";
import { Icon, Tap } from "../src/ui/primitives";

export default function Welcome() {
  const insets = useSafeAreaInsets();
  const rise = useSharedValue(60);
  const bob = useSharedValue(0);
  const tracking = useSharedValue(14);

  useEffect(() => {
    rise.value = withTiming(0, { duration: 1800, easing: Easing.out(Easing.cubic) });
    bob.value = withDelay(1800, withRepeat(withSequence(withTiming(-5, { duration: 2600, easing: Easing.inOut(Easing.sin) }), withTiming(5, { duration: 2600, easing: Easing.inOut(Easing.sin) })), -1, true));
    tracking.value = withDelay(500, withTiming(-1.5, { duration: 1600, easing: Easing.out(Easing.poly(5)) }));
  }, [rise, bob, tracking]);

  const moon = useAnimatedStyle(() => ({ transform: [{ translateY: rise.value + bob.value }], opacity: 1 - rise.value / 80 }));
  const word = useAnimatedStyle(() => ({ letterSpacing: tracking.value }));

  const finish = (signIn: boolean) => {
    welcome.set({ ...welcome.get(), seen: true });
    router.back();
    if (signIn) setTimeout(() => router.push("/signin"), 350);
  };

  return (
    <View style={styles.screen}>
      <Starfield />
      <View style={[styles.glow]} pointerEvents="none" />
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={moon}>
          <Image source={require("../assets/img/aura_moon.png")} style={{ width: 220, height: 275 }} contentFit="contain" />
        </Animated.View>
        <Animated.Text style={[type.wordmark, { marginTop: space.xl }, word]}>aura</Animated.Text>
        <Animated.Text entering={FadeIn.delay(900).duration(900)} style={[type.tagline, { marginTop: 6 }]}>
          Music, in its finest light.
        </Animated.Text>
      </View>
      <Animated.View entering={FadeInDown.delay(1300).duration(700)} style={[styles.bottom, { paddingBottom: insets.bottom + space.xl }]}>
        <Text style={[type.body, { color: theme.muted, textAlign: "center", marginBottom: space.xl }]}>
          Use the Google account you listen with on YouTube Music, and your library comes with you.
        </Text>
        <Tap onPress={() => finish(true)} style={styles.google} feedback="firm" accessibilityRole="button" accessibilityLabel="Continue with Google">
          <Icon name="person.crop.circle.fill" size={20} color={theme.night} />
          <Text style={[type.button, { color: theme.night }]}>Continue with Google</Text>
        </Tap>
        <Tap onPress={() => finish(false)} style={styles.skip} accessibilityRole="button">
          <Text style={[type.button, { color: theme.cream }]}>Just start listening</Text>
        </Tap>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.night },
  glow: { position: "absolute", top: "18%", alignSelf: "center", width: 340, height: 340, borderRadius: 170, backgroundColor: "rgba(236,228,214,0.05)" },
  bottom: { paddingHorizontal: space.xxl },
  google: { height: 54, borderRadius: 27, backgroundColor: theme.cream, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10 },
  skip: { height: 50, alignItems: "center", justifyContent: "center", marginTop: space.s },
});

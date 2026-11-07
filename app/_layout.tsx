import { useFonts } from "expo-font";
import { Stack, router } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import Aura from "../modules/aura-native";
import "../src/lyrics/lyrics";
import { welcome } from "../src/lib/store";
import { queue } from "../src/player/queue";
import { applySession, importLikes } from "../src/yt/account";
import { session } from "../src/yt/session";
import { theme } from "../src/theme";

void SplashScreen.preventAutoHideAsync();
void SystemUI.setBackgroundColorAsync(theme.night);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Serif: require("../assets/fonts/instrument_serif.ttf"),
    SerifItalic: require("../assets/fonts/instrument_serif_italic.ttf"),
  });

  useEffect(() => {
    applySession();
    queue.restore();
    Aura.prewarm();
    if (session.get()) void importLikes(200);
  }, []);

  const ready = fontsLoaded || !!fontError;
  useEffect(() => {
    if (!ready) return;
    const smoke = Aura.smokeVideo();
    if (smoke) {
      welcome.set({ ...welcome.get(), seen: true });
      setTimeout(() => router.push(`/smoke?v=${encodeURIComponent(smoke)}`), 400);
    } else if (!welcome.get().seen) setTimeout(() => router.push("/welcome"), 50);
  }, [ready]);

  useEffect(() => {
    if (fontsLoaded || fontError) void SplashScreen.hideAsync();
  }, [fontsLoaded, fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: theme.night }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: theme.night } }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen
          name="player"
          options={{ presentation: "modal", contentStyle: { backgroundColor: theme.night }, gestureEnabled: true }}
        />
        <Stack.Screen name="settings" options={{ presentation: "modal", contentStyle: { backgroundColor: theme.ink } }} />
        <Stack.Screen name="welcome" options={{ presentation: "fullScreenModal", animation: "fade", gestureEnabled: false }} />
        <Stack.Screen name="signin" options={{ presentation: "modal", contentStyle: { backgroundColor: theme.ink } }} />
        <Stack.Screen name="listen" options={{ presentation: "transparentModal", animation: "none" }} />
        <Stack.Screen name="smoke" options={{ presentation: "transparentModal", animation: "none" }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

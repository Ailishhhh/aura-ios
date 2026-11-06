import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import * as SystemUI from "expo-system-ui";
import { useEffect } from "react";
import { GestureHandlerRootView } from "react-native-gesture-handler";

import Aura from "../modules/aura-native";
import "../src/lyrics/lyrics";
import { queue } from "../src/player/queue";
import { theme } from "../src/theme";

void SplashScreen.preventAutoHideAsync();
void SystemUI.setBackgroundColorAsync(theme.night);

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Serif: require("../assets/fonts/instrument_serif.ttf"),
    SerifItalic: require("../assets/fonts/instrument_serif_italic.ttf"),
  });

  useEffect(() => {
    queue.restore();
    Aura.prewarm();
  }, []);

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
        <Stack.Screen name="listen" options={{ presentation: "transparentModal", animation: "none" }} />
        <Stack.Screen name="smoke" options={{ presentation: "transparentModal", animation: "none" }} />
      </Stack>
    </GestureHandlerRootView>
  );
}

// CI's self-test (src/smoke.ts), reached through aura://smoke?v=<id>.

import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { runSmoke } from "../src/smoke";

export default function Smoke() {
  const { v } = useLocalSearchParams<{ v?: string }>();
  useEffect(() => {
    // Show the player while the test runs, so CI's screenshots show it working; close it after,
    // so the pages CI opens next are on top.
    const timer = setTimeout(() => router.replace("/player"), 2500);
    void runSmoke(`aura://smoke?v=${v ?? ""}`).finally(() => {
      clearTimeout(timer);
      setTimeout(() => {
        if (router.canDismiss()) router.dismissAll();
      }, 3000);
    });
    return () => clearTimeout(timer);
  }, [v]);
  return <View />;
}

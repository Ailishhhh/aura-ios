// CI's self-test (src/smoke.ts), reached through aura://smoke?v=<id>.

import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { runSmoke } from "../src/smoke";

export default function Smoke() {
  const { v } = useLocalSearchParams<{ v?: string }>();
  useEffect(() => {
    void runSmoke(`aura://smoke?v=${v ?? ""}`);
    // Show the player, so the screenshots CI takes show it working.
    const timer = setTimeout(() => router.replace("/player"), 2500);
    return () => clearTimeout(timer);
  }, [v]);
  return <View />;
}

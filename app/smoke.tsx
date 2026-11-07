// CI's self-test (src/smoke.ts), opened at launch when AURA_SMOKE is set.

import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { View } from "react-native";

import { runSmoke } from "../src/smoke";

export default function Smoke() {
  const { v } = useLocalSearchParams<{ v?: string }>();
  const started = useRef(false);
  useEffect(() => {
    if (started.current || !v) return;
    started.current = true;
    void runSmoke(v);
  }, [v]);
  return <View />;
}

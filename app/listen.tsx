// Where a shared song link lands: start it with its radio, then show the player.

import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { View } from "react-native";

import { queue } from "../src/player/queue";

export default function Listen() {
  const { v, list } = useLocalSearchParams<{ v?: string; list?: string }>();
  useEffect(() => {
    if (v) void queue.playSong({ id: v, type: "song", title: "", artists: [], album: null, thumbnail: null, duration: null }, list ?? null);
    router.replace("/player");
  }, [v, list]);
  return <View />;
}

// Up next, inside the player: what's coming, tap to jump, long-press for more.

import { ActionSheetIOS, FlatList, StyleSheet, Text, View } from "react-native";

import { artistLine } from "../lib/store";
import { space, theme, type } from "../theme";
import { Artwork } from "../ui/Artwork";
import { Icon, Tap, haptic } from "../ui/primitives";
import { queue, useQueue } from "./queue";

export function UpNext() {
  const state = useQueue();
  const upcoming = state.tracks.slice(state.index + 1);
  return (
    <View style={{ flex: 1 }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={type.section}>Up Next</Text>
          <Text style={type.caption}>{state.source ? `From ${state.source}` : "Your queue"}</Text>
        </View>
        <Tap onPress={() => queue.toggleShuffle()} style={[styles.toggle, state.shuffle && styles.on]} scale={0.9} accessibilityLabel="Shuffle">
          <Icon name="shuffle" size={15} color={state.shuffle ? theme.night : theme.cream} />
        </Tap>
        <Tap onPress={() => queue.cycleRepeat()} style={[styles.toggle, state.repeat !== "off" && styles.on]} scale={0.9} accessibilityLabel={`Repeat ${state.repeat}`}>
          <Icon name={state.repeat === "one" ? "repeat.1" : "repeat"} size={15} color={state.repeat !== "off" ? theme.night : theme.cream} />
        </Tap>
      </View>
      <FlatList
        data={upcoming}
        keyExtractor={(t, i) => `${t.id}:${i}`}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item, index }) => {
          const at = state.index + 1 + index;
          return (
            <Tap
              onPress={() => void queue.skipTo(at)}
              onLongPress={() => {
                haptic.firm();
                ActionSheetIOS.showActionSheetWithOptions(
                  { title: item.title, options: ["Play next", "Move to end", "Remove from queue", "Cancel"], destructiveButtonIndex: 2, cancelButtonIndex: 3, userInterfaceStyle: "dark" },
                  (i) => {
                    if (i === 0) queue.move(at, state.index + 1);
                    if (i === 1) queue.move(at, state.tracks.length - 1);
                    if (i === 2) queue.removeAt(at);
                  },
                );
              }}
              style={styles.row}
              scale={0.985}
            >
              <Artwork uri={item.thumbnail} size={44} radius={6} />
              <View style={{ flex: 1 }}>
                <Text style={[type.row, { fontSize: 15 }]} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={type.caption} numberOfLines={1}>
                  {artistLine(item)}
                </Text>
              </View>
              <Tap onPress={() => queue.removeAt(at)} hitSlop={10} accessibilityLabel={`Remove ${item.title}`} feedback="light">
                <Icon name="minus.circle" size={18} color={theme.faint} />
              </Tap>
            </Tap>
          );
        }}
        ListEmptyComponent={<Text style={[type.caption, { padding: space.page }]}>Nothing queued. A radio will carry on when this ends.</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: "row", alignItems: "center", gap: 8, paddingBottom: space.m },
  toggle: { width: 34, height: 34, borderRadius: 17, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(236,228,214,0.1)" },
  on: { backgroundColor: theme.cream },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 6 },
});

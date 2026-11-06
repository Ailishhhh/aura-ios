// Phase 0: a plain screen to prove search, playback, the lock screen and links work on iOS.
// The real Aura interface (tabs, the morphing player, glass, dithered covers) replaces it next.

import { StatusBar } from "expo-status-bar";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";

import Aura from "../modules/aura-native";
import { DeepLink, findLink, parseLink } from "./links";
import { QueueState, queue, toTrack } from "./player/queue";
import { runSmoke } from "./smoke";
import { theme } from "./theme";
import { Item, next, search } from "./yt/music";

export default function App() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [state, setState] = useState<QueueState>(queue.snapshot());

  useEffect(() => queue.subscribe(setState), []);
  useEffect(() => Aura.prewarm(), []);

  const open = useRef(async (link: DeepLink) => {
    setMessage(null);
    switch (link.kind) {
      case "song":
        await queue.playSong({ id: link.videoId, title: "", artists: [] }, link.playlistId);
        return;
      case "playlist": {
        const page = await next({ list: link.id });
        await queue.playTracks(page.tracks.map(toTrack));
        return;
      }
      default:
        setMessage("Albums and artists open in the next build.");
    }
  }).current;

  // aura:// links, from the share sheet, Shortcuts, tryaura.today or CI.
  useEffect(() => {
    const handle = (url: string | null | undefined) => {
      if (!url) return;
      if (url.startsWith("aura://smoke")) {
        void runSmoke(url);
        return;
      }
      const link = parseLink(url);
      if (link) void open(link).catch((e) => setMessage(String(e.message ?? e)));
      else setMessage("That isn't a YouTube Music link");
    };
    void Linking.getInitialURL().then(handle);
    const subscription = Linking.addEventListener("url", ({ url }) => handle(url));
    return () => subscription.remove();
  }, [open]);

  const submit = async () => {
    const pasted = findLink(query);
    if (pasted) {
      await open(pasted).catch((e) => setMessage(String(e.message ?? e)));
      return;
    }
    if (!query.trim()) return;
    setBusy(true);
    setMessage(null);
    try {
      const page = await search(query.trim(), "songs");
      setResults(page.sections.flatMap((s) => s.items).filter((i) => i.type === "song" || i.type === "video"));
    } catch (error) {
      setMessage(String((error as Error).message ?? error));
    } finally {
      setBusy(false);
    }
  };

  const current = state.tracks[state.index];
  const playing = state.player.state === "playing" || state.player.state === "loading";
  const progress = state.player.duration ? state.player.position / state.player.duration : 0;

  return (
    <SafeAreaProvider>
    <SafeAreaView style={styles.screen}>
      <StatusBar style="light" />
      <Text style={styles.wordmark}>aura</Text>
      <TextInput
        style={styles.search}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={submit}
        placeholder="Search for songs, or paste a link"
        placeholderTextColor={theme.faint}
        returnKeyType="search"
        autoCorrect={false}
      />
      {busy && <ActivityIndicator color={theme.cream} style={styles.spinner} />}
      {message && <Text style={styles.message}>{message}</Text>}
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => void queue.playSong(toTrack(item))}>
            {item.thumbnail ? <Image source={{ uri: item.thumbnail }} style={styles.art} /> : <View style={styles.art} />}
            <View style={styles.rowText}>
              <Text style={styles.title} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={styles.caption} numberOfLines={1}>
                {item.artists?.map((a) => a.name).join(", ") || item.subtitle}
              </Text>
            </View>
          </Pressable>
        )}
      />
      {current && (
        <View style={styles.player}>
          <View style={[styles.progress, { width: `${Math.min(100, progress * 100)}%` }]} />
          <View style={styles.playerRow}>
            <View style={styles.rowText}>
              <Text style={styles.title} numberOfLines={1}>
                {current.title || "Loading…"}
              </Text>
              <Text style={styles.caption} numberOfLines={1}>
                {state.error ?? (current.artists.map((a) => a.name).join(", ") || state.stream?.author || "")}
              </Text>
            </View>
            <Pressable onPress={() => void queue.previous()} hitSlop={12}>
              <Text style={styles.control}>⏮</Text>
            </Pressable>
            <Pressable onPress={() => void queue.toggle()} hitSlop={12}>
              <Text style={styles.control}>{playing ? "⏸" : "▶️"}</Text>
            </Pressable>
            <Pressable onPress={() => void queue.next()} hitSlop={12}>
              <Text style={styles.control}>⏭</Text>
            </Pressable>
          </View>
        </View>
      )}
    </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.night },
  wordmark: { color: theme.cream, fontSize: 44, fontFamily: "Georgia", paddingHorizontal: 20, paddingTop: 12 },
  search: {
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 16,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.raised,
    color: theme.cream,
    fontSize: 15,
  },
  spinner: { marginTop: 16 },
  message: { color: theme.muted, marginHorizontal: 20, marginTop: 12 },
  list: { paddingVertical: 12, paddingBottom: 120 },
  row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 20, paddingVertical: 8 },
  art: { width: 48, height: 48, borderRadius: 6, backgroundColor: theme.raised },
  rowText: { flex: 1, marginHorizontal: 12 },
  title: { color: theme.cream, fontSize: 16 },
  caption: { color: theme.muted, fontSize: 12, marginTop: 2 },
  player: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 34,
    borderRadius: 18,
    backgroundColor: theme.raised,
    overflow: "hidden",
  },
  progress: { height: 2, backgroundColor: theme.cream },
  playerRow: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingRight: 16, gap: 18 },
  control: { color: theme.cream, fontSize: 22 },
});

// Search, with the system search field. Suggestions as you type, recent searches before you do,
// and links (music.youtube.com, youtu.be) open straight away when pasted.

import { Stack, router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Keyboard, ScrollView, StyleSheet, Text, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";

import { findLink } from "../../../src/links";
import { forgetSearch, rememberSearch, searches, useValue } from "../../../src/lib/store";
import { pagePath } from "../../../src/nav";
import { queue } from "../../../src/player/queue";
import { space, theme, type } from "../../../src/theme";
import { ItemRow, ShelfHeader } from "../../../src/ui/items";
import { Icon, Loading, Message, Tap } from "../../../src/ui/primitives";
import { SearchFilter, SearchResult, search, suggest } from "../../../src/yt/music";
import type { Item } from "../../../src/yt/types";

const FILTERS: { key: SearchFilter | null; label: string }[] = [
  { key: null, label: "All" },
  { key: "songs", label: "Songs" },
  { key: "albums", label: "Albums" },
  { key: "artists", label: "Artists" },
  { key: "playlists", label: "Playlists" },
  { key: "videos", label: "Videos" },
];

export default function Search() {
  const [text, setText] = useState("");
  const [submitted, setSubmitted] = useState<string | null>(null);
  const [filter, setFilter] = useState<SearchFilter | null>(null);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<{ queries: string[]; items: Item[] } | null>(null);
  const recent = useValue(searches);
  const job = useRef(0);

  // Suggestions, a moment after typing stops.
  useEffect(() => {
    const q = text.trim();
    if (!q || q === submitted || findLink(q)) {
      setSuggestions(null);
      return;
    }
    const timer = setTimeout(() => {
      suggest(q)
        .then((s) => setSuggestions(s))
        .catch(() => setSuggestions(null));
    }, 180);
    return () => clearTimeout(timer);
  }, [text, submitted]);

  const run = async (query: string, f: SearchFilter | null = filter) => {
    const q = query.trim();
    if (!q) return;
    const link = findLink(q);
    if (link) {
      openLink(link);
      return;
    }
    Keyboard.dismiss();
    rememberSearch(q);
    setSubmitted(q);
    setSuggestions(null);
    const mine = ++job.current;
    setBusy(true);
    setError(null);
    try {
      const page = await search(q, f ?? undefined);
      if (mine === job.current) setResults(page);
    } catch (e) {
      if (mine === job.current) setError(String((e as Error).message ?? e));
    } finally {
      if (mine === job.current) setBusy(false);
    }
  };

  const openLink = (link: NonNullable<ReturnType<typeof findLink>>) => {
    Keyboard.dismiss();
    switch (link.kind) {
      case "song":
        void queue.playSong({ id: link.videoId, type: "song", title: "", artists: [], album: null, thumbnail: null, duration: null }, link.playlistId);
        router.push("/player");
        return;
      case "playlist":
        router.push(pagePath("(search)", "playlist", link.id));
        return;
      case "album":
        router.push(pagePath("(search)", "album", link.browseId));
        return;
      case "artist":
        router.push(pagePath("(search)", "artist", link.browseId));
    }
  };

  const pasted = findLink(text);
  const showingResults = submitted != null && text.trim() === submitted;

  return (
    <>
      <Stack.Screen
        options={{
          headerSearchBarOptions: {
            placeholder: "Songs, artists, moods, or a link",
            autoCapitalize: "none",
            hideWhenScrolling: false,
            tintColor: theme.cream,
            textColor: theme.cream,
            barTintColor: theme.raised,
            onChangeText: (e: any) => setText(e.nativeEvent.text),
            onSearchButtonPress: (e: any) => void run(e.nativeEvent.text),
            onCancelButtonPress: () => {
              setText("");
              setSubmitted(null);
              setResults(null);
            },
          },
        }}
      />
      <ScrollView style={{ flex: 1, backgroundColor: theme.night }} contentInsetAdjustmentBehavior="automatic" keyboardDismissMode="on-drag" keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 140 }}>
        {pasted ? (
          <Tap onPress={() => openLink(pasted)} style={styles.suggestion}>
            <Icon name="link" size={17} color={theme.cream} />
            <Text style={[type.row, { flex: 1 }]}>Open this {pasted.kind === "song" ? "song" : pasted.kind}</Text>
            <Icon name="arrow.up.right" size={14} color={theme.muted} />
          </Tap>
        ) : null}

        {!text.trim() && recent.length ? (
          <View style={{ marginTop: space.m }}>
            <View style={styles.recentHeader}>
              <Text style={type.eyebrow}>Recent</Text>
              <Tap onPress={() => searches.set([])} hitSlop={10}>
                <Text style={[type.caption, { color: theme.cream }]}>Clear</Text>
              </Tap>
            </View>
            {recent.map((q) => (
              <Tap key={q} onPress={() => void run(q)} style={styles.suggestion}>
                <Icon name="clock.arrow.circlepath" size={16} color={theme.muted} />
                <Text style={[type.row, { flex: 1 }]} numberOfLines={1}>
                  {q}
                </Text>
                <Tap onPress={() => forgetSearch(q)} hitSlop={12} accessibilityLabel={`Forget ${q}`} feedback={null}>
                  <Icon name="xmark" size={12} color={theme.faint} />
                </Tap>
              </Tap>
            ))}
          </View>
        ) : null}

        {!text.trim() && !recent.length ? <Message title="Find anything" body="Search for a song, an artist, a mood — or paste a YouTube Music link." /> : null}

        {suggestions && !showingResults ? (
          <Animated.View entering={FadeIn.duration(150)}>
            {suggestions.queries.slice(0, 6).map((q) => (
              <Tap key={q} onPress={() => void run(q)} style={styles.suggestion}>
                <Icon name="magnifyingglass" size={15} color={theme.muted} />
                <Text style={[type.row, { flex: 1 }]} numberOfLines={1}>
                  {q}
                </Text>
                <Icon name="arrow.up.left" size={13} color={theme.faint} />
              </Tap>
            ))}
            {suggestions.items.map((item) => (
              <ItemRow key={`${item.type}:${item.id}`} item={item} />
            ))}
          </Animated.View>
        ) : null}

        {showingResults ? (
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
              {FILTERS.map((f) => {
                const active = f.key === filter;
                return (
                  <Tap
                    key={f.label}
                    onPress={() => {
                      setFilter(f.key);
                      void run(submitted!, f.key);
                    }}
                    style={[styles.filter, active && { backgroundColor: theme.cream }]}
                    scale={0.94}
                  >
                    <Text style={[type.caption, { fontWeight: "600", color: active ? theme.night : theme.cream }]}>{f.label}</Text>
                  </Tap>
                );
              })}
            </ScrollView>
            {busy ? <Loading /> : null}
            {error ? <Message title="Nothing came back" body={error} action="Try again" onAction={() => void run(submitted!)} /> : null}
            {!busy && results && !results.sections.length ? <Message title="No matches" body="Try a different spelling, or a mood." /> : null}
            {!busy &&
              results?.sections.map((section, i) => (
                <View key={`${section.title}:${i}`} style={{ marginTop: space.l }}>
                  {section.title ? <ShelfHeader title={section.title} /> : null}
                  {section.top ? <ItemRow item={section.top} /> : null}
                  {section.items.map((item, j) => (
                    <ItemRow key={`${item.type}:${item.id}:${j}`} item={item} list={section.items} source={`Search: ${submitted}`} />
                  ))}
                </View>
              ))}
          </>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  recentHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: space.page, marginBottom: 4 },
  suggestion: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: space.page, paddingVertical: 12 },
  filters: { paddingHorizontal: space.page, gap: 8, paddingVertical: space.s },
  filter: { paddingHorizontal: 14, height: 32, borderRadius: 16, justifyContent: "center", backgroundColor: theme.raised },
});

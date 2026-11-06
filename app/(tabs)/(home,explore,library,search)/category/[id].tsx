// A mood or genre: YouTube Music's own page for it, or one gathered by search when it has none.

import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLoad } from "../../../../src/lib/useLoad";
import { space, theme, type } from "../../../../src/theme";
import { Shelf } from "../../../../src/ui/items";
import { Loading, Message } from "../../../../src/ui/primitives";
import { category } from "../../../../src/yt/music";

export default function Category() {
  const { id, params, q, title } = useLocalSearchParams<{ id: string; params?: string; q?: string; title?: string }>();
  const insets = useSafeAreaInsets();
  const byId = id && id !== "search";
  const page = useLoad(`${id}:${params}:${q}`, () => category(byId ? { id, params } : { q: q ?? title ?? "" }));
  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.night }} contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: 140 }}>
      <View style={{ paddingHorizontal: space.page }}>
        <Text style={type.eyebrow}>Collection</Text>
        <Text style={[type.display, { marginTop: 6 }]}>{title ?? page.data?.title ?? ""}</Text>
      </View>
      {page.loading && !page.data ? <Loading /> : null}
      {page.error && !page.data ? <Message title="Couldn't open this" action="Try again" onAction={page.reload} /> : null}
      {(page.data?.sections ?? []).map((s, i) => (
        <Shelf key={`${s.title}:${i}`} section={s} index={i} />
      ))}
    </ScrollView>
  );
}

// "See all": a shelf opened in full. Songs as a list, everything else as a grid.

import { useLocalSearchParams } from "expo-router";
import { ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLoad } from "../../../../src/lib/useLoad";
import { space, theme, type } from "../../../../src/theme";
import { Card, ShelfHeader, SongRow } from "../../../../src/ui/items";
import { Loading, Message } from "../../../../src/ui/primitives";
import { browse } from "../../../../src/yt/music";

export default function Browse() {
  const { id, params, title } = useLocalSearchParams<{ id: string; params?: string; title?: string }>();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const page = useLoad(`${id}:${params}`, () => browse(id!, params));
  const tile = Math.floor((width - space.page * 2 - 16) / 2);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: theme.night }} contentContainerStyle={{ paddingTop: insets.top + 64, paddingBottom: 140 }}>
      <View style={{ paddingHorizontal: space.page, marginBottom: space.l }}>
        <Text style={[type.title]}>{title ?? page.data?.title ?? ""}</Text>
      </View>
      {page.loading && !page.data ? <Loading /> : null}
      {page.error && !page.data ? <Message title="Couldn't load this" action="Try again" onAction={page.reload} /> : null}
      {(page.data?.sections ?? []).map((section, i) => {
        const songs = section.items.every((it) => it.type === "song" || it.type === "video");
        return (
          <View key={`${section.title}:${i}`} style={{ marginBottom: space.xl }}>
            {section.title && section.title !== title ? <ShelfHeader title={section.title} /> : null}
            {songs ? (
              section.items.map((it, j) => <SongRow key={`${it.id}:${j}`} item={it} list={section.items} source={title ?? section.title} />)
            ) : (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, paddingHorizontal: space.page }}>
                {section.items.map((it, j) => (
                  <Card key={`${it.id}:${j}`} item={it} size={tile} />
                ))}
              </View>
            )}
          </View>
        );
      })}
    </ScrollView>
  );
}

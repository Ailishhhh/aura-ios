import { useLocalSearchParams } from "expo-router";
import { View } from "react-native";

import { itemActions } from "../../../../src/actions";
import { toTrack, toggleSaved, useSaved } from "../../../../src/lib/store";
import { useLoad } from "../../../../src/lib/useLoad";
import { openArtist, useTab } from "../../../../src/nav";
import { queue } from "../../../../src/player/queue";
import { Collection } from "../../../../src/ui/Collection";
import { Shelf } from "../../../../src/ui/items";
import { album } from "../../../../src/yt/music";

export default function Album() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tab = useTab();
  const page = useLoad(id ?? null, () => album(id!));
  const saved = useSaved(id);
  const data = page.data;
  const songs = data?.songs ?? [];
  const tracks = songs.map((s) => toTrack(s));
  const asItem = data ? { type: "album" as const, id: data.id, title: data.title, artists: data.artists, thumbnail: data.thumbnail, year: data.year, kind: data.kind, playlistId: data.playlistId } : null;

  return (
    <Collection
      cover={data?.thumbnail}
      title={data?.title ?? ""}
      eyebrow={data?.kind ?? "Album"}
      artists={data?.artists}
      meta={[data?.year, data?.meta].filter(Boolean).join(" · ") || null}
      description={data?.description}
      songs={songs}
      numbered
      source={data?.title ?? "Album"}
      loading={page.loading}
      error={page.error?.message}
      onRetry={page.reload}
      onPlay={() => void queue.playTracks(tracks, 0, { source: data?.title })}
      onShuffle={() => void queue.playTracks(tracks, 0, { source: data?.title, shuffle: true })}
      saved={saved}
      onSave={asItem ? () => toggleSaved(asItem) : undefined}
      onMore={asItem ? () => itemActions(asItem, tab) : undefined}
      onArtist={(a) => a.id && openArtist(tab, a.id)}
      footer={
        <View>
          {(data?.more ?? []).map((section, i) => (
            <Shelf key={`${section.title}:${i}`} section={section} index={i} />
          ))}
        </View>
      }
    />
  );
}

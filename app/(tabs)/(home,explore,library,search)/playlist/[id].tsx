import { useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";

import { itemActions } from "../../../../src/actions";
import { toTrack, toggleSaved, useSaved } from "../../../../src/lib/store";
import { useLoad } from "../../../../src/lib/useLoad";
import { useTab } from "../../../../src/nav";
import { queue } from "../../../../src/player/queue";
import { Collection } from "../../../../src/ui/Collection";
import { playlist, playlistMore } from "../../../../src/yt/music";
import type { Item } from "../../../../src/yt/types";

export default function Playlist() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const tab = useTab();
  const page = useLoad(id ?? null, () => playlist(id!));
  const saved = useSaved(id?.replace(/^VL/, ""));
  const [extra, setExtra] = useState<Item[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setExtra([]);
    setToken(page.data?.continuation ?? null);
  }, [page.data]);

  const data = page.data;
  const songs = [...(data?.songs ?? []), ...extra];
  const isRadio = (id ?? "").startsWith("RD");

  const loadMore = async () => {
    if (!token || busy) return;
    setBusy(true);
    try {
      const next = await playlistMore(token);
      setExtra((e) => [...e, ...next.songs]);
      setToken(next.continuation);
    } finally {
      setBusy(false);
    }
  };

  const play = (shuffle: boolean) => {
    if (!data) return;
    // Radios and long playlists go through YouTube's queue, so they keep going past what's loaded.
    if (isRadio || token) void queue.playList(data.id, { source: data.title, shuffle });
    else void queue.playTracks(songs.map((s) => toTrack(s)), 0, { source: data.title, shuffle });
  };

  const asItem = data ? { type: "playlist" as const, id: data.id, title: data.title, thumbnail: data.thumbnail, author: data.author, subtitle: data.author } : null;

  return (
    <Collection
      cover={data?.thumbnail}
      title={data?.title ?? ""}
      eyebrow={isRadio ? "Radio" : "Playlist"}
      byline={data?.author ? `By ${data.author}` : null}
      meta={data?.meta}
      description={data?.description}
      songs={songs}
      source={data?.title ?? "Playlist"}
      loading={page.loading}
      error={page.error?.message}
      onRetry={page.reload}
      onPlay={() => play(false)}
      onShuffle={() => play(true)}
      saved={saved}
      onSave={asItem ? () => toggleSaved(asItem) : undefined}
      onMore={asItem ? () => itemActions(asItem, tab) : undefined}
      onEndReached={() => void loadMore()}
    />
  );
}

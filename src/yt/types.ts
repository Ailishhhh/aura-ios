// The shapes parse.js produces (the web player's parser, shared unchanged).

export type ItemType = "song" | "video" | "album" | "playlist" | "artist" | "episode" | "podcast";

export type Artist = { name: string; id?: string | null };
export type AlbumRef = { name: string; id?: string | null };

export type Item = {
  type: ItemType;
  id: string;
  title: string;
  subtitle?: string;
  artists?: Artist[];
  album?: AlbumRef | null;
  year?: string | null;
  thumbnail?: string | null;
  duration?: number | null;
  explicit?: boolean;
  playlistId?: string | null;
  views?: string | null;
  kind?: string;
  author?: string | null;
  count?: string | null;
  setVideoId?: string | null;
  unavailable?: boolean;
};

export type More = { browseId: string; params: string | null };

export type Section = {
  title: string;
  label?: string | null;
  items: Item[];
  more?: More | null;
  list?: boolean;
  grid?: boolean;
  top?: Item | null;
  continuation?: string | null;
};

export type Chip = { title: string; params: string | null };

export type Feed = { title: string | null; chips: Chip[]; sections: Section[]; continuation: string | null };

export type MoodButton = { title: string; browseId?: string; params?: string | null; color?: number | null; query?: string };
export type MoodGroup = { title: string; items: MoodButton[] };

export type AlbumPage = {
  type: "album";
  id: string;
  title: string;
  kind: string;
  artists: Artist[];
  year: string | null;
  thumbnail: string | null;
  description: string | null;
  playlistId: string | null;
  meta: string | null;
  songs: Item[];
  more: Section[];
};

export type PlaylistPage = {
  type: "playlist";
  id: string;
  title: string;
  author: string | null;
  description: string | null;
  meta: string | null;
  thumbnail: string | null;
  songs: Item[];
  continuation: string | null;
};

export type ArtistPage = {
  type: "artist";
  id: string;
  title: string;
  thumbnail: string | null;
  description: string | null;
  audience: string | null;
  subscribers: string | null;
  channelId: string | null;
  radioId: string | null;
  shuffleId: string | null;
  sections: Section[];
};

export type NextPage = {
  title: string | null;
  tracks: Item[];
  continuation: string | null;
  lyricsId: string | null;
  relatedId: string | null;
};

export type TimedLine = { start: number; end: number; text: string };
export type YouTubeLyrics = { timed: TimedLine[] | null; plain: { text: string; source: string | null } | null };

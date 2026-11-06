// Turns InnerTube's renderers into the few plain shapes the web player draws. Every reader here is
// defensive: YouTube moves fields between versions and regions, and a missing field should cost
// one item, never a whole page.
//
// An item is { type, id, title, subtitle, artists, album, year, thumbnail, duration, explicit,
// playlistId, … } where type is song, video, album, playlist, artist, episode or podcast.

const PAGE_TYPES = {
  MUSIC_PAGE_TYPE_ALBUM: "album",
  MUSIC_PAGE_TYPE_AUDIOBOOK: "album",
  MUSIC_PAGE_TYPE_PLAYLIST: "playlist",
  MUSIC_PAGE_TYPE_ARTIST: "artist",
  MUSIC_PAGE_TYPE_USER_CHANNEL: "artist",
  MUSIC_PAGE_TYPE_LIBRARY_ARTIST: "artist",
  MUSIC_PAGE_TYPE_PODCAST_SHOW_DETAIL_PAGE: "podcast",
  MUSIC_PAGE_TYPE_NON_MUSIC_AUDIO_TRACK_PAGE: "episode",
};

const SEPARATOR = /^\s*[•·]\s*$/;
const DOT_SPLIT = /\s+•\s+/;
/** Words YouTube puts first in a search row's subtitle to say what the row is. */
const TYPE_WORDS = new Set(["Song", "Video", "Album", "Single", "EP", "Playlist", "Artist", "Episode", "Podcast", "Profile", "Station", "Audiobook"]);

export const text = (t) => (t?.runs ? t.runs.map((r) => r.text).join("") : t?.simpleText ?? "");

/** Seconds from "3:45" or "1:02:03". */
export function seconds(value) {
  if (!value || !/^\d+(:\d{1,2}){1,2}$/.test(value.trim())) return null;
  return value
    .trim()
    .split(":")
    .reduce((total, part) => total * 60 + Number(part), 0);
}

/** The biggest thumbnail of any thumbnail-ish object. */
export function thumb(node) {
  if (!node) return null;
  const list =
    node.musicThumbnailRenderer?.thumbnail?.thumbnails ??
    node.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails ??
    node.thumbnail?.thumbnails ??
    node.thumbnails ??
    node.thumbnailRenderer?.musicThumbnailRenderer?.thumbnail?.thumbnails ??
    node.musicThumbnailRenderer?.thumbnail?.thumbnails;
  if (!Array.isArray(list) || !list.length) return null;
  const best = list.reduce((a, b) => ((b.width ?? 0) >= (a.width ?? 0) ? b : a));
  let url = best.url;
  if (url?.startsWith("//")) url = `https:${url}`;
  return url ?? null;
}

const pageTypeOf = (endpoint) =>
  endpoint?.browseEndpoint?.browseEndpointContextSupportedConfigs?.browseEndpointContextMusicConfig?.pageType;

const videoTypeOf = (endpoint) => endpoint?.watchEndpoint?.watchEndpointMusicSupportedConfigs?.watchEndpointMusicConfig?.musicVideoType;

/** ATV is the official audio of a release; everything else that plays is a video of some kind. */
const kindOfVideo = (videoType) => (!videoType || videoType === "MUSIC_VIDEO_TYPE_ATV" ? "song" : videoType === "MUSIC_VIDEO_TYPE_PODCAST_EPISODE" ? "episode" : "video");

/** Splits runs on " • " into groups of runs. */
function groups(runs = []) {
  const out = [[]];
  for (const run of runs) {
    if (SEPARATOR.test(run.text)) out.push([]);
    else out[out.length - 1].push(run);
  }
  return out.filter((g) => g.length);
}

function artistsFrom(runs = []) {
  const artists = [];
  for (const run of runs) {
    const id = run.navigationEndpoint?.browseEndpoint?.browseId;
    const type = PAGE_TYPES[pageTypeOf(run.navigationEndpoint)];
    if (id && type === "artist") artists.push({ name: run.text, id });
  }
  if (artists.length) return artists;
  // Without links, the names are the text between the commas and ampersands.
  const plain = runs.map((r) => r.text).join("");
  return plain
    .split(/\s*(?:,|&)\s*/)
    .map((name) => name.trim())
    .filter((name) => name && !/^\d/.test(name) && !/views?$|plays?$|subscribers?$/i.test(name))
    .map((name) => ({ name, id: null }));
}

function albumFrom(runs = []) {
  const run = runs.find((r) => r.navigationEndpoint?.browseEndpoint?.browseId?.startsWith("MPREb"));
  return run ? { name: run.text, id: run.navigationEndpoint.browseEndpoint.browseId } : null;
}

const yearFrom = (str) => {
  const match = str?.match(/\b(19|20)\d{2}\b/);
  return match ? Number(match[0]) : null;
};

const explicitOf = (badges) => !!badges?.some((b) => b.musicInlineBadgeRenderer?.icon?.iconType === "MUSIC_EXPLICIT_BADGE");

const stripVL = (id) => (id?.startsWith("VL") ? id.slice(2) : id);

/** The play button over a card or row, which knows the playlist or video it starts. */
function overlayEndpoint(r) {
  const overlay = r.thumbnailOverlay ?? r.overlay;
  return overlay?.musicItemThumbnailOverlayRenderer?.content?.musicPlayButtonRenderer?.playNavigationEndpoint;
}

/** A card in a carousel or grid. */
export function twoRow(r) {
  if (!r) return null;
  const title = text(r.title);
  if (!title) return null;
  const nav = r.navigationEndpoint ?? {};
  const subtitleRuns = r.subtitle?.runs ?? [];
  const subtitle = text(r.subtitle);
  const thumbnail = thumb(r.thumbnailRenderer);
  const explicit = explicitOf(r.subtitleBadges);
  if (nav.watchEndpoint?.videoId) {
    const type = kindOfVideo(videoTypeOf(nav));
    const parts = groups(subtitleRuns);
    // A song card's subtitle is "Song • Artist" or just the artists.
    const artistRuns = parts.find((g) => g.some((run) => PAGE_TYPES[pageTypeOf(run.navigationEndpoint)] === "artist")) ?? parts.find((g) => !TYPE_WORDS.has(g[0]?.text)) ?? [];
    return {
      type,
      id: nav.watchEndpoint.videoId,
      title,
      subtitle,
      artists: artistsFrom(artistRuns),
      album: albumFrom(subtitleRuns),
      thumbnail,
      explicit,
      views: parts.map((g) => text({ runs: g })).find((s) => /views?$/.test(s)) ?? null,
    };
  }
  if (nav.watchPlaylistEndpoint?.playlistId) {
    return { type: "playlist", id: nav.watchPlaylistEndpoint.playlistId, title, subtitle, thumbnail, playlistId: nav.watchPlaylistEndpoint.playlistId, radio: true };
  }
  const browseId = nav.browseEndpoint?.browseId;
  if (!browseId) return null;
  const type = PAGE_TYPES[pageTypeOf(nav)] ?? (browseId.startsWith("MPREb") ? "album" : browseId.startsWith("VL") ? "playlist" : browseId.startsWith("UC") ? "artist" : null);
  if (!type) return null;
  const play = overlayEndpoint(r);
  const playlistId = play?.watchPlaylistEndpoint?.playlistId ?? play?.watchEndpoint?.playlistId ?? null;
  if (type === "album") {
    const parts = groups(subtitleRuns);
    const kind = parts[0]?.[0]?.text;
    return {
      type,
      id: browseId,
      title,
      subtitle,
      kind: TYPE_WORDS.has(kind) ? kind : "Album",
      artists: artistsFrom(subtitleRuns),
      year: yearFrom(subtitle),
      thumbnail,
      explicit,
      playlistId,
    };
  }
  if (type === "playlist") {
    const parts = groups(subtitleRuns).map((g) => text({ runs: g }));
    return {
      type,
      id: stripVL(browseId),
      title,
      subtitle,
      author: parts.find((p) => p !== "Playlist" && !/\d/.test(p)) ?? null,
      count: parts.find((p) => /\d/.test(p)) ?? null,
      thumbnail,
      playlistId: playlistId ?? stripVL(browseId),
    };
  }
  return { type, id: browseId, title, subtitle, thumbnail };
}

/** The columns of a list row, as runs. */
const flex = (r, i) => r.flexColumns?.[i]?.musicResponsiveListItemFlexColumnRenderer?.text;
const fixed = (r, i) => r.fixedColumns?.[i]?.musicResponsiveListItemFixedColumnRenderer?.text;

/** A row in a list: search results, playlist tracks, an artist's top songs. */
export function responsive(r, context = {}) {
  if (!r) return null;
  const titleText = flex(r, 0);
  const title = text(titleText);
  if (!title) return null;
  const titleRun = titleText?.runs?.[0];
  const rest = [];
  for (let i = 1; i < (r.flexColumns?.length ?? 0); i++) {
    const runs = flex(r, i)?.runs;
    if (runs?.length) {
      if (rest.length) rest.push({ text: " • " });
      rest.push(...runs);
    }
  }
  const parts = groups(rest);
  const subtitle = parts.map((g) => text({ runs: g })).join(" • ");
  const thumbnail = thumb(r.thumbnail) ?? context.thumbnail ?? null;
  const explicit = explicitOf(r.badges);
  const play = overlayEndpoint(r);
  const videoId =
    r.playlistItemData?.videoId ??
    titleRun?.navigationEndpoint?.watchEndpoint?.videoId ??
    play?.watchEndpoint?.videoId ??
    r.navigationEndpoint?.watchEndpoint?.videoId;
  const fixedText = text(fixed(r, 0));
  if (videoId) {
    const endpoint = titleRun?.navigationEndpoint?.watchEndpoint ? titleRun.navigationEndpoint : play?.watchEndpoint ? play : r.navigationEndpoint;
    let type = kindOfVideo(videoTypeOf(endpoint));
    // Search rows say what they are first.
    const lead = parts[0]?.[0]?.text;
    if (lead === "Video") type = "video";
    if (lead === "Song") type = "song";
    if (lead === "Episode") type = "episode";
    const body = TYPE_WORDS.has(lead) ? parts.slice(1) : parts;
    const artistGroup = body.find((g) => g.some((run) => PAGE_TYPES[pageTypeOf(run.navigationEndpoint)] === "artist")) ?? body[0] ?? [];
    let artists = artistsFrom(artistGroup);
    if (!artists.length && context.artists) artists = context.artists;
    const duration = seconds(fixedText) ?? seconds(body.map((g) => text({ runs: g })).reverse().find((s) => seconds(s) != null));
    return {
      type,
      id: videoId,
      title,
      subtitle: body.map((g) => text({ runs: g })).join(" • ") || context.subtitle || "",
      artists,
      album: albumFrom(rest) ?? context.album ?? null,
      thumbnail,
      duration,
      explicit,
      views: body.map((g) => text({ runs: g })).find((s) => /(views?|plays?)$/.test(s)) ?? null,
      unavailable: r.musicItemRendererDisplayPolicy === "MUSIC_ITEM_RENDERER_DISPLAY_POLICY_GREY_OUT" || undefined,
      setVideoId: r.playlistItemData?.playlistSetVideoId,
    };
  }
  const browse = r.navigationEndpoint?.browseEndpoint ?? titleRun?.navigationEndpoint?.browseEndpoint;
  const browseId = browse?.browseId;
  if (!browseId) return null;
  const type = PAGE_TYPES[pageTypeOf({ browseEndpoint: browse })] ?? (browseId.startsWith("MPREb") ? "album" : browseId.startsWith("VL") ? "playlist" : browseId.startsWith("UC") ? "artist" : null);
  if (!type) return null;
  const lead = parts[0]?.[0]?.text;
  const body = TYPE_WORDS.has(lead) ? parts.slice(1) : parts;
  const bodyText = body.map((g) => text({ runs: g }));
  if (type === "album") {
    return {
      type,
      id: browseId,
      title,
      subtitle: bodyText.join(" • "),
      kind: TYPE_WORDS.has(lead) ? lead : "Album",
      artists: artistsFrom(body[0] ?? []),
      year: yearFrom(bodyText.join(" ")),
      thumbnail,
      explicit,
      playlistId: play?.watchPlaylistEndpoint?.playlistId ?? null,
    };
  }
  if (type === "playlist") {
    return {
      type,
      id: stripVL(browseId),
      title,
      subtitle: bodyText.join(" • "),
      author: bodyText.find((p) => !/\d/.test(p)) ?? null,
      count: bodyText.find((p) => /\d/.test(p)) ?? null,
      thumbnail,
      playlistId: play?.watchPlaylistEndpoint?.playlistId ?? stripVL(browseId),
    };
  }
  if (type === "artist") {
    return { type, id: browseId, title, subtitle: bodyText.find((p) => /subscriber|listener|audience/i.test(p)) ?? bodyText.join(" • "), thumbnail };
  }
  return { type, id: browseId, title, subtitle: bodyText.join(" • "), thumbnail };
}

/** A podcast page made from a playlist ("MPSP" + its id) is just that playlist. */
function asPlaylist(parsed) {
  if (parsed?.type === "podcast" && parsed.id.startsWith("MPSP")) {
    const id = parsed.id.slice(4);
    return { ...parsed, type: "playlist", id, playlistId: id, author: parsed.subtitle?.split(" • ")[0] ?? null };
  }
  return parsed;
}

/** Any item renderer, whatever its kind. */
export function item(node, context) {
  if (!node) return null;
  if (node.musicTwoRowItemRenderer) return asPlaylist(twoRow(node.musicTwoRowItemRenderer));
  if (node.musicResponsiveListItemRenderer) return asPlaylist(responsive(node.musicResponsiveListItemRenderer, context));
  if (node.musicMultiRowListItemRenderer) {
    const r = node.musicMultiRowListItemRenderer;
    const id = r.onTap?.watchEndpoint?.videoId;
    if (!id) return null;
    return { type: "episode", id, title: text(r.title), subtitle: text(r.subtitle), thumbnail: thumb(r.thumbnail), artists: [], duration: null };
  }
  if (node.playlistPanelVideoRenderer) return panelVideo(node.playlistPanelVideoRenderer);
  if (node.playlistPanelVideoWrapperRenderer) return panelVideo(node.playlistPanelVideoWrapperRenderer.primaryRenderer?.playlistPanelVideoRenderer);
  return null;
}

const items = (list, context) => (list ?? []).map((n) => item(n, context)).filter(Boolean);

/** A song in a play queue. */
export function panelVideo(r) {
  if (!r?.videoId) return null;
  const byline = groups(r.longBylineText?.runs);
  const bylineText = byline.map((g) => text({ runs: g }));
  const type = kindOfVideo(videoTypeOf(r.navigationEndpoint));
  let artists = artistsFrom(byline[0] ?? []);
  if (!artists.length) artists = artistsFrom(r.shortBylineText?.runs ?? []);
  return {
    type,
    id: r.videoId,
    title: text(r.title),
    subtitle: bylineText.join(" • "),
    artists,
    album: albumFrom(r.longBylineText?.runs),
    year: yearFrom(bylineText.slice(1).join(" ")),
    thumbnail: thumb(r.thumbnail),
    duration: seconds(text(r.lengthText)),
    views: bylineText.find((s) => /views?$/.test(s)) ?? null,
  };
}

const continuationToken = (node) =>
  node?.continuations?.[0]?.nextContinuationData?.continuation ??
  node?.continuations?.[0]?.reloadContinuationData?.continuation ??
  null;

/** The token behind a list's last row, where newer responses keep it. */
const trailingToken = (list) => {
  const last = list?.[list.length - 1]?.continuationItemRenderer;
  return last?.continuationEndpoint?.continuationCommand?.token ?? null;
};

/** Every shelf in a section list, flattened to { title, label, items, more }. */
export function shelves(contents = []) {
  const out = [];
  for (const node of contents) {
    if (node.musicCarouselShelfRenderer) {
      const r = node.musicCarouselShelfRenderer;
      const header = r.header?.musicCarouselShelfBasicHeaderRenderer ?? r.header?.musicImmersiveCarouselShelfBasicHeaderRenderer;
      const more = header?.moreContentButton?.buttonRenderer?.navigationEndpoint?.browseEndpoint ?? header?.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint ?? null;
      out.push({
        title: text(header?.title),
        label: text(header?.strapline) || null,
        items: items(r.contents),
        more: more ? { browseId: more.browseId, params: more.params ?? null } : null,
      });
    } else if (node.musicShelfRenderer) {
      const r = node.musicShelfRenderer;
      const bottom = r.bottomEndpoint?.browseEndpoint ?? r.title?.runs?.[0]?.navigationEndpoint?.browseEndpoint;
      out.push({
        title: text(r.title),
        items: items(r.contents),
        more: bottom ? { browseId: bottom.browseId, params: bottom.params ?? null } : null,
        list: true,
        continuation: continuationToken(r) ?? trailingToken(r.contents),
      });
    } else if (node.gridRenderer) {
      const r = node.gridRenderer;
      out.push({ title: text(r.header?.gridHeaderRenderer?.title), items: items(r.items), grid: true });
    } else if (node.musicCardShelfRenderer) {
      out.push({ title: "Top result", top: cardShelf(node.musicCardShelfRenderer), items: items(node.musicCardShelfRenderer.contents) });
    } else if (node.musicPlaylistShelfRenderer) {
      out.push({ title: "", items: items(node.musicPlaylistShelfRenderer.contents), list: true, continuation: trailingToken(node.musicPlaylistShelfRenderer.contents) ?? continuationToken(node.musicPlaylistShelfRenderer) });
    } else if (node.itemSectionRenderer) {
      const inner = node.itemSectionRenderer.contents ?? [];
      // Newer pages put bare items in item sections, with no shelf around them.
      const bare = items(inner);
      if (bare.length) out.push({ title: "", items: bare, loose: true });
      out.push(...shelves(inner));
    }
  }
  return out;
}

/** The big "Top result" card in a search. */
function cardShelf(r) {
  const titleRun = r.title?.runs?.[0];
  const nav = titleRun?.navigationEndpoint ?? r.onTap;
  const subtitleRuns = r.subtitle?.runs ?? [];
  const thumbnail = thumb(r.thumbnail);
  if (nav?.watchEndpoint?.videoId) {
    const parts = groups(subtitleRuns);
    const body = TYPE_WORDS.has(parts[0]?.[0]?.text) ? parts.slice(1) : parts;
    return {
      type: kindOfVideo(videoTypeOf(nav)),
      id: nav.watchEndpoint.videoId,
      title: text(r.title),
      subtitle: body.map((g) => text({ runs: g })).join(" • "),
      artists: artistsFrom(body[0] ?? []),
      album: albumFrom(subtitleRuns),
      thumbnail,
      duration: seconds(body.map((g) => text({ runs: g })).reverse().find((s) => seconds(s) != null)),
    };
  }
  const browse = nav?.browseEndpoint;
  if (!browse?.browseId) return null;
  const type = PAGE_TYPES[pageTypeOf(nav)] ?? (browse.browseId.startsWith("UC") ? "artist" : browse.browseId.startsWith("MPREb") ? "album" : "playlist");
  const parts = groups(subtitleRuns).map((g) => text({ runs: g }));
  return {
    type,
    id: type === "playlist" ? stripVL(browse.browseId) : browse.browseId,
    title: text(r.title),
    subtitle: parts.filter((p) => !TYPE_WORDS.has(p)).join(" • "),
    kind: parts[0],
    artists: type === "album" ? artistsFrom(subtitleRuns) : undefined,
    thumbnail,
  };
}

/** The tabs of a browse page, single- or two-column. */
function browseSections(json) {
  const single = json.contents?.singleColumnBrowseResultsRenderer?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer;
  const two = json.contents?.twoColumnBrowseResultsRenderer;
  const primary = two?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer;
  const secondary = two?.secondaryContents?.sectionListRenderer;
  return { single, primary, secondary };
}

/** A home-like feed: chips across the top, then shelves. */
export function feed(json) {
  const { single, primary, secondary } = browseSections(json);
  const list = single ?? primary ?? secondary;
  const continuationList = json.continuationContents?.sectionListContinuation;
  const source = list ?? continuationList;
  const chips = (source?.header?.chipCloudRenderer?.chips ?? [])
    .map((c) => c.chipCloudChipRenderer)
    .filter(Boolean)
    .map((c) => ({ title: text(c.text), params: c.navigationEndpoint?.browseEndpoint?.params ?? null }));
  return {
    title: text(json.header?.musicHeaderRenderer?.title) || null,
    chips,
    sections: shelves(source?.contents).filter((s) => s.items.length),
    continuation: continuationToken(source),
  };
}

/** Moods and genres: titled groups of buttons, each opening a category page. */
export function moods(json) {
  const { single } = browseSections(json);
  const groupsOut = [];
  for (const node of single?.contents ?? []) {
    const grid = node.gridRenderer;
    if (!grid) continue;
    const title = text(grid.header?.gridHeaderRenderer?.title);
    const buttons = (grid.items ?? [])
      .map((i) => i.musicNavigationButtonRenderer)
      .filter(Boolean)
      .map((b) => ({
        title: text(b.buttonText),
        browseId: b.clickCommand?.browseEndpoint?.browseId,
        params: b.clickCommand?.browseEndpoint?.params ?? null,
        color: b.solid?.leftStripeColor ?? null,
      }))
      .filter((b) => b.browseId);
    if (buttons.length) groupsOut.push({ title, items: buttons });
  }
  return groupsOut;
}

/** An album's page. */
export function album(json, browseId) {
  const { primary, secondary, single } = browseSections(json);
  const headerNode = primary?.contents?.[0] ?? single?.contents?.[0];
  const header = headerNode?.musicResponsiveHeaderRenderer ?? json.header?.musicDetailHeaderRenderer;
  const title = text(header?.title);
  const subtitleRuns = header?.subtitle?.runs ?? [];
  const strapline = header?.straplineTextOne?.runs ?? [];
  const artists = artistsFrom(strapline.length ? strapline : groups(subtitleRuns)[1] ?? []);
  const subtitleParts = groups(subtitleRuns).map((g) => text({ runs: g }));
  const thumbnail = thumb(header?.thumbnail) ?? thumb(json.background);
  const year = yearFrom(subtitleParts.join(" "));
  const description = text(header?.description?.musicDescriptionShelfRenderer?.description) || null;
  const trackShelf = (secondary?.contents ?? single?.contents ?? []).find((n) => n.musicShelfRenderer)?.musicShelfRenderer;
  const context = { thumbnail, artists, album: { name: title, id: browseId } };
  const songs = items(trackShelf?.contents, context).map((s) => ({ ...s, type: s.type === "video" ? "video" : "song", thumbnail: thumbnail ?? s.thumbnail, artists: s.artists?.length ? s.artists : artists, album: { name: title, id: browseId } }));
  // The album's playlist lets it be played as a whole, and radio from it.
  const canonical = json.microformat?.microformatDataRenderer?.urlCanonical ?? "";
  const playlistId =
    canonical.match(/list=([\w-]+)/)?.[1] ??
    JSON.stringify(header?.buttons ?? []).match(/"playlistId":"(OLAK[\w-]+)"/)?.[1] ??
    null;
  const others = shelves(secondary?.contents ?? []).filter((s) => !s.list && s.items.length);
  return {
    type: "album",
    id: browseId,
    title,
    kind: subtitleParts[0] || "Album",
    artists,
    year,
    thumbnail,
    description,
    playlistId,
    meta: text(header?.secondSubtitle) || null,
    songs,
    more: others,
  };
}

/** A playlist's page, and its continuation token. */
export function playlist(json, id) {
  const { primary, secondary, single } = browseSections(json);
  const headerNode = primary?.contents?.[0] ?? single?.contents?.[0];
  const header =
    headerNode?.musicResponsiveHeaderRenderer ??
    headerNode?.musicEditablePlaylistDetailHeaderRenderer?.header?.musicResponsiveHeaderRenderer ??
    json.header?.musicDetailHeaderRenderer ??
    json.header?.musicEditablePlaylistDetailHeaderRenderer?.header?.musicDetailHeaderRenderer;
  const shelfNode = (secondary?.contents ?? single?.contents ?? []).find((n) => n.musicPlaylistShelfRenderer || n.musicShelfRenderer);
  const shelf = shelfNode?.musicPlaylistShelfRenderer ?? shelfNode?.musicShelfRenderer;
  const strap = text(header?.straplineTextOne);
  const subtitleParts = groups(header?.subtitle?.runs).map((g) => text({ runs: g }));
  return {
    type: "playlist",
    id,
    title: text(header?.title),
    author: strap || subtitleParts.find((p) => p !== "Playlist" && !/\d/.test(p)) || null,
    description: text(header?.description?.musicDescriptionShelfRenderer?.description) || null,
    meta: text(header?.secondSubtitle) || subtitleParts.filter((p) => /\d/.test(p)).join(" • ") || null,
    thumbnail: thumb(header?.thumbnail),
    songs: items(shelf?.contents).filter((s) => s.type !== "artist"),
    continuation: trailingToken(shelf?.contents) ?? continuationToken(shelf),
  };
}

/** More rows of a playlist or a list shelf. */
export function continuation(json) {
  const appended = json.onResponseReceivedActions?.[0]?.appendContinuationItemsAction?.continuationItems;
  if (appended) return { songs: items(appended).filter((s) => s.type !== "artist"), continuation: trailingToken(appended) };
  const shelf = json.continuationContents?.musicPlaylistShelfContinuation ?? json.continuationContents?.musicShelfContinuation;
  if (shelf) return { songs: items(shelf.contents), continuation: continuationToken(shelf) ?? trailingToken(shelf.contents) };
  const grid = json.continuationContents?.gridContinuation;
  if (grid) return { songs: items(grid.items), continuation: continuationToken(grid) };
  const sections = json.continuationContents?.sectionListContinuation;
  if (sections) return { sections: shelves(sections.contents).filter((s) => s.items.length), continuation: continuationToken(sections) };
  return { songs: [], continuation: null };
}

/** An artist's page. */
export function artist(json, browseId) {
  const h = json.header?.musicImmersiveHeaderRenderer ?? json.header?.musicVisualHeaderRenderer ?? json.header?.musicHeaderRenderer;
  const { single } = browseSections(json);
  const contents = single?.contents ?? [];
  const about = contents.find((n) => n.musicDescriptionShelfRenderer)?.musicDescriptionShelfRenderer;
  const sections = shelves(contents).filter((s) => s.items.length);
  const subscription = h?.subscriptionButton?.subscribeButtonRenderer;
  const radio = h?.startRadioButton?.buttonRenderer?.navigationEndpoint?.watchPlaylistEndpoint ?? h?.startRadioButton?.buttonRenderer?.navigationEndpoint?.watchEndpoint;
  const shuffle = h?.playButton?.buttonRenderer?.navigationEndpoint?.watchPlaylistEndpoint ?? h?.playButton?.buttonRenderer?.navigationEndpoint?.watchEndpoint;
  return {
    type: "artist",
    id: browseId,
    title: text(h?.title),
    thumbnail: thumb(h?.thumbnail) ?? thumb(h?.foregroundThumbnail),
    description: text(about?.description) || text(h?.description) || null,
    audience: text(h?.monthlyListenerCount) || text(about?.subheader) || null,
    subscribers: text(subscription?.subscriberCountText) || text(subscription?.longSubscriberCountText) || null,
    channelId: subscription?.channelId ?? (browseId.startsWith("UC") ? browseId : null),
    radioId: radio?.playlistId ?? null,
    shuffleId: shuffle?.playlistId ?? null,
    sections,
  };
}

/** A search's suggestions: words to complete with, and things to jump straight to. */
export function suggestions(json) {
  const sections = json.contents ?? [];
  const queries = [];
  const things = [];
  for (const section of sections) {
    for (const node of section.searchSuggestionsSectionRenderer?.contents ?? []) {
      const s = node.searchSuggestionRenderer;
      if (s) queries.push(text(s.suggestion) || s.navigationEndpoint?.searchEndpoint?.query);
      const r = node.musicResponsiveListItemRenderer;
      if (r) {
        const parsed = responsive(r);
        if (parsed) things.push(parsed);
      }
    }
  }
  return { queries: queries.filter(Boolean), items: things };
}

/** A search's results, grouped the way YouTube Music groups them. */
export function search(json) {
  const tabs = json.contents?.tabbedSearchResultsRenderer?.tabs;
  const list = tabs?.[0]?.tabRenderer?.content?.sectionListRenderer ?? json.contents?.sectionListRenderer;
  if (json.continuationContents) {
    const shelf = json.continuationContents.musicShelfContinuation;
    return { sections: [{ title: "", items: items(shelf?.contents), list: true }], continuation: continuationToken(shelf) };
  }
  const out = shelves(list?.contents);
  // The top card: its headline, and the few rows that ride along with it.
  const sections = [];
  const loose = [];
  for (const s of out) {
    if (s.top !== undefined) {
      if (s.top) sections.push({ title: "Top result", top: s.top, items: s.items });
      continue;
    }
    if (s.loose) {
      loose.push(...s.items);
      continue;
    }
    const existing = sections.find((x) => x.title === s.title && !x.top);
    if (existing) existing.items.push(...s.items);
    else if (s.items.length) sections.push(s);
  }
  // Loose results, grouped by kind as YouTube Music's own shelves would group them.
  const KINDS = [
    ["song", "Songs"],
    ["video", "Videos"],
    ["album", "Albums"],
    ["artist", "Artists"],
    ["playlist", "Playlists"],
    ["episode", "Episodes"],
    ["podcast", "Podcasts"],
  ];
  for (const [type, title] of KINDS) {
    const found = loose.filter((i) => i.type === type);
    if (!found.length) continue;
    const existing = sections.find((x) => x.title === title);
    if (existing) existing.items.push(...found);
    else sections.push({ title, items: found });
  }
  const single = sections.length === 1 ? sections[0] : null;
  return { sections, continuation: single?.continuation ?? null };
}

/** The watch page: the queue around a song, and the doors to its lyrics and related music. */
export function next(json) {
  const tabs = json.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer?.watchNextTabbedResultsRenderer?.tabs ?? [];
  let panel = tabs[0]?.tabRenderer?.content?.musicQueueRenderer?.content?.playlistPanelRenderer;
  const cont = json.continuationContents?.playlistPanelContinuation;
  if (cont) panel = cont;
  const tracks = items(panel?.contents).filter((t) => t.id);
  const tabIds = tabs.map((t) => t.tabRenderer?.endpoint?.browseEndpoint?.browseId ?? null);
  return {
    title: panel?.title ?? null,
    tracks,
    continuation: panel?.continuations?.[0]?.nextRadioContinuationData?.continuation ?? panel?.continuations?.[0]?.nextContinuationData?.continuation ?? null,
    lyricsId: tabIds.find((id) => id?.startsWith("MPLY")) ?? null,
    relatedId: tabIds.find((id) => id?.startsWith("MPTR")) ?? null,
  };
}

/** Timed lyrics, from the Android app's answer: one line per cue. */
export function timedLyrics(json) {
  let found = null;
  const search = (node) => {
    if (found || !node || typeof node !== "object") return;
    if (Array.isArray(node.timedLyricsData)) {
      found = node.timedLyricsData;
      return;
    }
    for (const value of Object.values(node)) search(value);
  };
  search(json);
  if (!found) return null;
  return found
    .map((line) => {
      const start = Number(line.cueRange?.startTimeMilliseconds);
      const end = Number(line.cueRange?.endTimeMilliseconds);
      if (!Number.isFinite(start)) return null;
      return { start, end: Number.isFinite(end) ? end : start, text: line.lyricLine ?? "" };
    })
    .filter(Boolean);
}

/** Plain lyrics, and where they came from. */
export function plainLyrics(json) {
  const shelf = json.contents?.sectionListRenderer?.contents?.find((n) => n.musicDescriptionShelfRenderer)?.musicDescriptionShelfRenderer;
  if (!shelf) return null;
  return { text: text(shelf.description), source: text(shelf.footer) || null };
}

/** What the player knows of a song: its length and how loud it was mastered. */
export function player(json) {
  const details = json.videoDetails ?? {};
  return {
    id: details.videoId ?? null,
    title: details.title ?? null,
    author: details.author ?? null,
    duration: Number(details.lengthSeconds) || null,
    loudnessDb: json.playerConfig?.audioConfig?.loudnessDb ?? null,
    playable: json.playabilityStatus?.status === "OK",
    thumbnail: thumb(details.thumbnail),
    musicVideoType: details.musicVideoType ?? null,
  };
}

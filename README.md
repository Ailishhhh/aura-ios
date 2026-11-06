# Aura for iPhone

Aura, the YouTube Music client, rebuilt for iOS with React Native and Expo. The Android app lives
in [laura](https://github.com/Ailishhhh/laura); this is its iPhone sibling.

## What's in it

- **Native iOS 26 design.** The system Liquid Glass tab bar (Home, Explore, Library, and Search
  as its own round tab), with the mini player in the tab bar's accessory, like Apple Music.
  Older iPhones get a frosted tab bar and a floating glass mini player.
- **Aura's look.** Every cover printed in one of the Android app's four dither styles (Noise,
  Bayer, Halftone, Lines; ported to Skia), Instrument Serif headlines, the warm night palette,
  tonight's real moon on Home.
- **Now Playing.** The printed cover over its own colours, blurred and slowly turning. Tap the
  cover for lyrics, double-tap to like, swipe to skip; it settles back when paused. Up Next, sleep
  timer with a fade, shuffle, repeat.
- **Lyrics** from lrc.red and YouTube Music, drawn word by word by am-lyrics, as on Android.
- **Plays in the background**, with lock screen, Control Center and headphone controls, and
  carries on into a radio when a song, album or playlist ends.
- **Library on the phone**: liked songs, playlists you make, saved albums and playlists, followed
  artists, history and listening stats. Export and import it as a file; the format is the web
  player's, so the same file moves between them.
- **Links**: paste a YouTube Music link into Search, use **Share → Aura** from YouTube Music,
  YouTube or Safari, or open `aura://open?url=<link>` (Shortcuts, tryaura.today).

## How it fits together

| Part | Path | What it does |
|---|---|---|
| Screens | `app/` | Expo Router: tabs, shared album/playlist/artist pages, the player and settings as sheets |
| App logic | `src/` | Queue, library store, lyrics, YouTube Music client (ported from the web player) |
| Native module | `modules/aura-native/ios/` | Swift: AVQueuePlayer, lock screen, remote commands, audio session |
| Kotlin backend | `shared/` | Kotlin Multiplatform on [InnerTubeX](https://github.com/MetrolistGroup/innertubex), the same stream extraction the Android app uses, built into `AuraShared.xcframework` |
| Share extension | `plugins/` | Config plugin and Swift for Share → Aura |
| CI | `.github/workflows/ios.yml` | Builds on a GitHub macOS runner, tests in the iOS Simulator, produces an unsigned `.ipa` |

iOS can't play Opus/WebM, so the backend only asks InnerTubeX for AAC (MP4) streams.

## Building without a Mac

Every push to `main` builds on GitHub Actions. Each run's artifact holds:

- `Aura-<version>.ipa`, unsigned, for sideloading
- `smoke/`: screenshots and `smoke.json` from the simulator test (resolve → play → next song)
- build logs

Pushing a tag like `v0.2.0` also attaches the IPA to a GitHub release.

## Installing on an iPhone

The IPA is unsigned. Install it with [AltStore](https://altstore.io) or
[SideStore](https://sidestore.io) (a Windows PC works for the first setup), signed with your own
free Apple ID. Free Apple IDs keep sideloaded apps working for 7 days at a time, allow 3 apps,
and count Aura's share extension as a second App ID.

## Development

```bash
npm install
npm test                                     # link parser tests
npx tsc --noEmit
node scripts/embed-lyrics.mjs                # after changing assets/lyrics
cd shared && ./gradlew jvmTest -Paura.live=true   # resolves real streams on the JVM
```

## License

GPL-3.0, like Aura for Android. It includes code derived from
[Metrolist](https://github.com/MetrolistGroup/Metrolist) and uses
[InnerTubeX](https://github.com/MetrolistGroup/innertubex), both GPL-3.0.
am-lyrics (MPL-2.0) is bundled unmodified; see `assets/lyrics/LICENSE-am-lyrics.txt`.

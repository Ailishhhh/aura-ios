# Aura for iPhone

Aura, the YouTube Music client, rebuilt for iOS with React Native and Expo. The Android app lives
in [laura](https://github.com/Ailishhhh/laura); this repo is its iOS sibling.

**Status: phase 0.** A plain test screen that searches YouTube Music, plays songs in the
background with lock-screen controls, continues into a radio, and opens YouTube Music links.
The real Aura interface comes next.

## How it fits together

| Part | Path | What it does |
|---|---|---|
| App | `src/` | React Native (TypeScript). Queue logic ported from the web player |
| Native module | `modules/aura-native/ios/` | Swift: AVQueuePlayer, lock screen, remote commands, audio session |
| Kotlin backend | `shared/` | Kotlin Multiplatform on [InnerTubeX](https://github.com/MetrolistGroup/innertubex), the same stream extraction the Android app uses, built into `AuraShared.xcframework` |
| CI | `.github/workflows/ios.yml` | Builds everything on a GitHub macOS runner, runs a smoke test in the iOS Simulator, and produces an unsigned `.ipa` |

iOS can't play Opus/WebM, so the backend asks InnerTubeX for AAC (MP4) streams only.

## Building without a Mac

Every push to `main` builds on GitHub Actions. The run's artifact holds:

- `Aura-<version>.ipa`, unsigned, for sideloading
- `smoke/`: screenshots and `smoke.json` from the simulator test (resolve → play → move to next song)
- build logs

Pushing a tag like `v0.1.0` also attaches the IPA to a GitHub release.

## Installing on an iPhone

The IPA is unsigned. Install it with [AltStore](https://altstore.io) or
[SideStore](https://sidestore.io) (Windows works for the first setup), signed with your own free
Apple ID. Free Apple IDs keep sideloaded apps working for 7 days at a time and allow 3 of them.

## Opening YouTube Music links

iOS only lets an app claim web links for domains it owns, so Aura can't take over
`music.youtube.com` the way it does on Android. Links reach it these ways instead:

- **Paste** a link into search.
- **`aura://` links**: `aura://open?url=<link>`, or YouTube Music paths on Aura's scheme
  (`aura://watch?v=…`, `aura://playlist?list=…`).
- **Share sheet** (next phase): "Share → Aura" from YouTube Music, YouTube or Safari.

## Development

```bash
npm install
npm test                     # link parser tests
npx tsc --noEmit
cd shared && ./gradlew jvmTest -Paura.live=true   # resolves real streams on the JVM
```

## License

GPL-3.0, like Aura for Android. It includes code derived from
[Metrolist](https://github.com/MetrolistGroup/Metrolist) and uses
[InnerTubeX](https://github.com/MetrolistGroup/innertubex), both GPL-3.0.

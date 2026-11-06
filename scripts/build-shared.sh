#!/usr/bin/env bash
# Builds the Kotlin backend (shared/) into AuraShared.xcframework for the native module.
# Needs macOS with Xcode. Extra arguments go to Gradle, e.g. -PinnertubexSource=../innertubex
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root/shared"
./gradlew --no-daemon --stacktrace assembleAuraSharedReleaseXCFramework "$@"

dest="$root/modules/aura-native/ios/Frameworks"
rm -rf "$dest/AuraShared.xcframework"
mkdir -p "$dest"
cp -R build/XCFrameworks/release/AuraShared.xcframework "$dest/"
echo "AuraShared.xcframework copied to $dest"

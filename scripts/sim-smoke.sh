#!/usr/bin/env bash
# Installs Aura in an iOS Simulator, opens aura://smoke?v=<id>, and waits for the app's own report
# (src/smoke.ts). Fails unless a stream was resolved and played. Usage:
#   scripts/sim-smoke.sh path/to/Aura.app [videoId] [output dir]
set -euo pipefail

app="$1"
video="${2:-dQw4w9WgXcQ}"
out="${3:-smoke}"
bundle="org.aura.music"
mkdir -p "$out"

device="$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
phones = [d for runtime, ds in sorted(devices.items(), reverse=True) if "iOS" in runtime for d in ds if d["name"].startswith("iPhone")]
print(phones[0]["udid"])
')"
echo "Simulator: $device"
xcrun simctl boot "$device" 2>/dev/null || true
xcrun simctl bootstatus "$device" -b
# Apple silicon simulators refuse to launch unsigned apps; an ad-hoc signature is enough.
codesign --verify "$app" 2>/dev/null || codesign --force --deep --sign - "$app"
codesign -dv "$app" 2>&1 | head -5 || true
plutil -p "$app/Info.plist" | grep -E "CFBundleIdentifier|MinimumOSVersion|CFBundleExecutable|UIDeviceFamily|CFBundleSupportedPlatforms" -A1 || true
lipo -info "$app/$(plutil -extract CFBundleExecutable raw "$app/Info.plist")" || true
xcrun simctl install "$device" "$app"
sleep 5

xcrun simctl spawn "$device" log stream --style compact --level info \
  --predicate 'process == "Aura"' > "$out/device.log" 2>&1 &
log_pid=$!
trap 'kill $log_pid 2>/dev/null || true' EXIT

launched=no
for attempt in 1 2 3 4; do
  if xcrun simctl launch --terminate-running-process \
    --stdout="$out/stdout.log" --stderr="$out/stderr.log" "$device" "$bundle"; then
    launched=yes
    break
  fi
  echo "Launch attempt $attempt failed; SpringBoard may still be settling"
  sleep 15
done
if [ "$launched" != yes ]; then
  echo "::error::Aura wouldn't launch in the simulator"
  echo "--- Can the simulator launch Settings? ---"
  xcrun simctl launch "$device" com.apple.Preferences || true
  echo "--- What SpringBoard and RunningBoard said ---"
  xcrun simctl spawn "$device" log show --last 3m --style compact \
    --predicate 'eventMessage CONTAINS[c] "aura" OR process == "runningboardd" AND eventMessage CONTAINS[c] "denied"' 2>/dev/null | tail -n 60 || true
  echo "--- Signature check ---"
  codesign --verify --deep --strict --verbose=2 "$app" 2>&1 | tail -n 20 || true
  echo "--- Running the binary directly, to see dyld's complaint ---"
  installed="$(xcrun simctl get_app_container "$device" "$bundle" app)"
  ( DYLD_PRINT_LIBRARIES=0 xcrun simctl spawn "$device" "$installed/Aura" > "$out/spawn.log" 2>&1 & echo $! > "$out/spawn.pid" )
  sleep 12
  kill "$(cat "$out/spawn.pid")" 2>/dev/null || true
  head -c 6000 "$out/spawn.log" || true
  echo "--- Crash reports ---"
  mkdir -p "$out/crashes"
  find ~/Library/Logs/DiagnosticReports -name '*Aura*' -mmin -30 -exec cp {} "$out/crashes/" \; 2>/dev/null || true
  for report in "$out"/crashes/*; do [ -f "$report" ] && head -c 4000 "$report"; done
  exit 1
fi
sleep 10
xcrun simctl io "$device" screenshot "$out/1-launch.png"

xcrun simctl openurl "$device" "aura://smoke?v=$video"
data="$(xcrun simctl get_app_container "$device" "$bundle" data)"
report="$data/Documents/smoke.json"

for _ in $(seq 1 120); do
  if [ -f "$report" ] && grep -q '"finishedAt"' "$report"; then break; fi
  sleep 2
  [ -f "$report" ] && [ ! -f "$out/2-playing.png" ] && grep -q '"playback"' "$report" \
    && xcrun simctl io "$device" screenshot "$out/2-playing.png"
done
xcrun simctl io "$device" screenshot "$out/3-end.png"

# Photograph the main pages, opened the way shared links open them.
if [ -f "$report" ]; then
  sleep 5
  shot=4
  for page in $(python3 -c '
import json, sys, urllib.parse
p = json.load(open(sys.argv[1])).get("pages") or {}
links = []
if p.get("album"): links.append("https://music.youtube.com/browse/" + p["album"])
if p.get("artist"): links.append("https://music.youtube.com/channel/" + p["artist"])
if p.get("radio"): links.append("https://music.youtube.com/playlist?list=" + p["radio"])
print(" ".join("aura://open?url=" + urllib.parse.quote(l, safe="") for l in links))
' "$report"); do
    xcrun simctl openurl "$device" "$page" || true
    sleep 9
    xcrun simctl io "$device" screenshot "$out/$shot-page.png"
    shot=$((shot + 1))
  done
fi

if [ ! -f "$report" ]; then
  echo "::error::The app never wrote smoke.json"
  tail -n 80 "$out/device.log" || true
  exit 1
fi
cp "$report" "$out/smoke.json"
cat "$out/smoke.json"

python3 - "$out/smoke.json" <<'EOF'
import json, sys
r = json.load(open(sys.argv[1]))
def ok(key): return bool((r.get(key) or {}).get("ok"))
print(f"resolve={ok('resolve')} playback={ok('playback')} advance={ok('advance')}")
if r.get("crash"): print("::error::" + r["crash"].splitlines()[0])
if not ok("advance"): print("::warning::Moving on to the next song natively didn't work")
sys.exit(0 if ok("resolve") and ok("playback") else 1)
EOF

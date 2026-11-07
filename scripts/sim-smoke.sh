#!/usr/bin/env bash
# Installs Aura in an iOS Simulator, launches it with AURA_SMOKE=<id> so it runs its own self-test
# (src/smoke.ts), photographs each screen the test shows, and fails unless a stream was resolved
# and played. Usage:
#   scripts/sim-smoke.sh path/to/Aura.app [videoId] [output dir]
set -euo pipefail

app="$1"
video="${2:-dQw4w9WgXcQ}"
out="${3:-smoke}"
bundle="org.aura.music"
mkdir -p "$out"
# Absolute: launchd opens --stdout/--stderr paths from the simulator's read-only root otherwise.
out="$(cd "$out" && pwd)"
app="$(cd "$(dirname "$app")" && pwd)/$(basename "$app")"

device="${SIM_UDID:-$(xcrun simctl list devices available -j | python3 -c '
import json, sys
devices = json.load(sys.stdin)["devices"]
phones = [d for runtime, ds in sorted(devices.items(), reverse=True) if "iOS" in runtime for d in ds if d["name"].startswith("iPhone")]
print(phones[0]["udid"])
')}"
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

xcrun simctl spawn "$device" log stream --style compact --level debug \
  --predicate 'process == "Aura" OR process == "runningboardd" OR process == "SpringBoard" OR process == "launchd_sim" OR process == "installd" OR process == "lsd"' > "$out/device.log" 2>&1 &
log_pid=$!
trap 'kill $log_pid 2>/dev/null || true' EXIT

launched=no
for attempt in 1 2 3 4; do
  if SIMCTL_CHILD_AURA_SMOKE="$video" xcrun simctl launch --terminate-running-process \
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
  echo "--- Why the system refused (runningboardd, launchd) ---"
  sleep 2
  grep -iE "aura" "$out/device.log" | grep -iE "error|fail|denied|invalid|refus|reason|launch|spawn|security|signature|entitle|constraint" | grep -v "SwitcherModifier" | head -n 80 || true
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
data="$(xcrun simctl get_app_container "$device" "$bundle" data)"
report="$data/Documents/smoke.json"
stagefile="$data/Documents/stage.txt"

xcrun simctl io "$device" recordVideo --codec=h264 --force "$out/run.mp4" > /dev/null 2>&1 &
video_pid=$!
sleep 4
xcrun simctl io "$device" screenshot "$out/00-launch.png"

# The app writes "<n>:<screen>" to stage.txt whenever a screen is ready to photograph.
seen=""
for _ in $(seq 1 240); do
  if [ -f "$stagefile" ]; then
    now="$(cat "$stagefile")"
    if [ "$now" != "$seen" ]; then
      seen="$now"
      name="$(printf '%02d' "${now%%:*}")-${now#*:}"
      [ "${now#*:}" = done ] && break
      xcrun simctl io "$device" screenshot "$out/$name.png" && echo "Photographed $name"
    fi
  fi
  if [ -f "$report" ] && grep -q '"finishedAt"' "$report"; then break; fi
  # The app stopped: no point waiting.
  # Simulator apps are ordinary processes on the Mac, so the host can see whether it's alive.
  if ! pgrep -f "/Aura.app/Aura" > /dev/null; then
    echo "::error::Aura stopped running during the test"
    break
  fi
  sleep 1
done
xcrun simctl io "$device" screenshot "$out/99-end.png"
kill -INT "$video_pid" 2>/dev/null || true
sleep 3
echo "--- What the app printed ---"
grep -vE "UIBackgroundModes|_setUpFeatureFlags" "$out/stderr.log" | tail -n 40 || true

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

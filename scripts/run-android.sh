#!/usr/bin/env bash
# Build, install and launch the Android debug app on the local emulator (Windows / Git Bash).
#
# Why this exists: on this machine a MinGW cmake (WinLibs) sits on the user PATH and breaks
# the native build, Node is a winget user-scope install that Git Bash does not see, and
# Gradle must be pointed at the SDK's own cmake. This script sets all of that up.
#
# Usage:  bash scripts/run-android.sh            # build + install + launch
#         bash scripts/run-android.sh --no-build # just install the last APK and launch
#         bash scripts/run-android.sh --boot     # also boot the "groov_pixel" AVD first
# Metro must be running separately:  npx expo start
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SDK_WIN='C:\Users\Isaac\AppData\Local\Android\Sdk'
SDK="/c/Users/Isaac/AppData/Local/Android/Sdk"
JAVA_HOME="/c/Users/Isaac/scoop/apps/temurin17-jdk/current"
NODE_DIR="$(dirname "$(ls -d /c/Users/Isaac/AppData/Local/Microsoft/WinGet/Packages/OpenJS.NodeJS.LTS_*/node-v*/node.exe | head -1)")"
AVD="groov_pixel"
PKG="com.beastlyiceking.groov"
ADB="$SDK/platform-tools/adb.exe"

export JAVA_HOME ANDROID_HOME="$SDK_WIN" ANDROID_SDK_ROOT="$SDK_WIN"
# Strip the MinGW toolchain so Gradle cannot pick up its cmake.
export PATH="$JAVA_HOME/bin:$NODE_DIR:$SDK/platform-tools:$SDK/emulator:$(echo "$PATH" | tr ':' '\n' | grep -vi 'winlibs\|mingw' | paste -sd:)"

BUILD=1; BOOT=0
for a in "$@"; do
  case "$a" in
    --no-build) BUILD=0 ;;
    --boot) BOOT=1 ;;
  esac
done

if [ "$BOOT" = 1 ]; then
  if ! "$ADB" devices | grep -q "emulator-.*device"; then
    echo "Booting AVD $AVD..."
    "$SDK/emulator/emulator.exe" -avd "$AVD" -no-boot-anim -no-snapshot-save -netdelay none -netspeed full >/dev/null 2>&1 &
    for _ in $(seq 1 60); do
      if [ "$("$ADB" shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" = "1" ]; then break; fi
      sleep 3
    done
  fi
fi

if [ ! -d "$ROOT/android" ]; then
  echo "No android/ directory; running prebuild..."
  (cd "$ROOT" && CI=1 npx expo prebuild --platform android --no-install)
fi

# Gradle needs forward slashes here; backslashes are escapes in .properties files.
printf 'sdk.dir=C:/Users/Isaac/AppData/Local/Android/Sdk\ncmake.dir=C:/Users/Isaac/AppData/Local/Android/Sdk/cmake/3.22.1\n' > "$ROOT/android/local.properties"

if [ "$BUILD" = 1 ]; then
  (cd "$ROOT/android" && ./gradlew.bat app:assembleDebug -x lint -x test --build-cache \
      -PreactNativeDevServerPort=8081 -PreactNativeArchitectures=x86_64 \
      | tr '\r' '\n' | grep -E "BUILD|What went wrong|error:|> Task :app:assembleDebug" || true)
fi

APK="$ROOT/android/app/build/outputs/apk/debug/app-debug.apk"
[ -f "$APK" ] || { echo "APK not found at $APK"; exit 1; }
"$ADB" install -r "$APK" | tail -1
"$ADB" reverse tcp:8081 tcp:8081
"$ADB" shell am start -n "$PKG/.MainActivity" >/dev/null
echo "Launched $PKG. Screenshot: \"$ADB\" exec-out screencap -p > shot.png"

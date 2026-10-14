#!/usr/bin/env bash
# Emulator UI helper for Claude Code / manual testing (Git Bash on Windows).
# Usage:  source scripts/emu.sh   then:  tap X Y [wait] | type "text" | shot name | texts | focus | back | dismiss_banner | gboard
# Screenshots go to ./.emu-shots (gitignored). Coordinates are in the 1080x2400 device space.
ADB="/c/Users/Isaac/AppData/Local/Android/Sdk/platform-tools/adb.exe"
DEV="${DEV:-emulator-5554}"
SHOTS="${SHOTS:-$(pwd)/.emu-shots}"; mkdir -p "$SHOTS"
A() { "$ADB" -s "$DEV" shell "$@"; }
tap() { A input tap "$1" "$2"; sleep "${3:-1}"; }
shot() { "$ADB" -s "$DEV" exec-out screencap -p > "$SHOTS/$1.png"; echo "shot $1"; }
focus() { A dumpsys window 2>/dev/null | grep -m1 -o "mCurrentFocus=.*"; }
back() { A input keyevent 4; sleep "${1:-1}"; }
# Type text without triggering React Native's dev "double R = reload" shortcut:
# split on 'r' and pause >200ms between chunks. Spaces become %s for `input text`.
type() {
  local s="$1" chunk=""
  local i c
  for (( i=0; i<${#s}; i++ )); do
    c="${s:$i:1}"
    if [[ "$c" == "r" || "$c" == "R" ]]; then
      [ -n "$chunk" ] && A input text "$(printf '%s' "$chunk" | sed 's/ /%s/g')"
      sleep 0.35
      A input text "$c"
      sleep 0.35
      chunk=""
    else
      chunk+="$c"
    fi
  done
  [ -n "$chunk" ] && A input text "$(printf '%s' "$chunk" | sed 's/ /%s/g')"
  sleep 0.5
}
# Visible text nodes (needs uiautomator); RN text shows as text= attributes
texts() { A uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; A cat //sdcard/ui.xml 2>/dev/null | grep -o 'text="[^"]\{2,\}"' | sed 's/text=//' | tr '\n' ' '; echo; }
dismiss_banner() { tap 995 2209 0.5; }
gboard() { A ime set com.google.android.inputmethod.latin/com.android.inputmethod.latin.LatinIME >/dev/null; }
hide_kbd() { A input keyevent 111; sleep 0.5; }  # ESC hides IME; note: also acts as Back when no IME is up

#!/usr/bin/env bash
# Reclaim disk after a fixture's screenshots are captured. Essential for
# dev-build runs, where each `expo run:<platform>` leaves multi-GB native build
# output (iOS Pods + DerivedData, Android Gradle build). Removes the heavy,
# regenerable artifacts and keeps the app source + git history, so the grader's
# `git diff` still works.
#
# Usage: clean-fixture.sh <project-path>
#
# Env: EXPO_SKILL_EVAL_KEEP_DERIVEDDATA=1 skips the iOS DerivedData sweep (set it
#   only if you keep a real Xcode project literally named "fixture").
set -uo pipefail

APP="${1:?usage: clean-fixture.sh <project-path>}"

resolve_dir() {
  local raw="$1"
  [[ -d "$raw" ]] || return 1
  (cd "$raw" && pwd -P)
}

canonical_tmp() {
  local tmp="${TMPDIR:-/tmp}"
  tmp="${tmp%/}"
  if [[ -d "$tmp" ]]; then
    (cd "$tmp" && pwd -P)
  else
    printf '%s\n' "$tmp"
  fi
}

is_eval_workspace_path() {
  local resolved="$1"
  local tmp
  tmp="$(canonical_tmp)"
  case "$resolved" in
    "$tmp"/expo-skill-eval-*|/tmp/expo-skill-eval-*|/private/tmp/expo-skill-eval-*)
      return 0
      ;;
  esac
  return 1
}

eval_workspace_root() {
  local resolved="$1"
  local acc=""
  local part
  local IFS=/
  local -a parts
  read -ra parts <<< "$resolved"
  for part in "${parts[@]}"; do
    [[ -z "$part" ]] && continue
    acc="$acc/$part"
    if [[ "$part" == expo-skill-eval-* ]]; then
      printf '%s\n' "$acc"
      return 0
    fi
  done
  return 1
}

pid_cwd() {
  local pid="$1"
  if [[ -d "/proc/$pid" ]]; then
    readlink -f "/proc/$pid/cwd" 2>/dev/null || true
  else
    lsof -a -p "$pid" -d cwd -Fn 2>/dev/null | awk '/^n/ { print substr($0, 2); exit }'
  fi
}

pid_command() {
  local pid="$1"
  if [[ -r "/proc/$pid/cmdline" ]]; then
    tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true
  else
    ps -o command= -p "$pid" 2>/dev/null || true
  fi
}

belongs_to_eval_workspace() {
  local pid="$1"
  local workspace="$2"
  local cwd cmd
  cwd="$(pid_cwd "$pid")"
  if [[ -n "$cwd" && ( "$cwd" == "$workspace" || "$cwd" == "$workspace"/* ) ]]; then
    return 0
  fi
  cmd="$(pid_command "$pid")"
  if [[ -n "$cmd" && "$cmd" == *"$workspace"* ]]; then
    return 0
  fi
  return 1
}

listening_pids() {
  local port="$1"
  if command -v lsof >/dev/null 2>&1; then
    # `-sTCP:LISTEN` is REQUIRED: without it, `lsof -ti tcp:8082` also matches
    # the established adb reverse tunnel and SIGKILLing adb crashes the emulator.
    lsof -ti "tcp:$port" -sTCP:LISTEN 2>/dev/null || true
    return
  fi
  if command -v ss >/dev/null 2>&1; then
    ss -lptn "sport = :$port" 2>/dev/null | sed -n 's/.*pid=\([0-9][0-9]*\).*/\1/p'
    return
  fi
  if command -v fuser >/dev/null 2>&1; then
    fuser "${port}/tcp" 2>/dev/null | tr -cs '0-9' '\n' | grep -E '^[0-9]+$' || true
  fi
}

kill_fixture_listeners() {
  local port="$1"
  local workspace="$2"
  local pid
  for pid in $(listening_pids "$port"); do
    if belongs_to_eval_workspace "$pid" "$workspace"; then
      kill -9 "$pid" 2>/dev/null || true
    fi
  done
}

APP_RESOLVED="$(resolve_dir "$APP")" || {
  echo "clean-fixture: $APP not found, skipping"
  exit 0
}

if ! is_eval_workspace_path "$APP_RESOLVED"; then
  echo "clean-fixture: refusing to clean '$APP' (resolved $APP_RESOLVED; not under a tmp expo-skill-eval workspace)" >&2
  exit 1
fi

WORKSPACE="$(eval_workspace_root "$APP_RESOLVED")" || {
  echo "clean-fixture: refusing to clean '$APP_RESOLVED' (no expo-skill-eval-* path component)" >&2
  exit 1
}

# Stop Metro / Expo listeners that belong to this eval workspace only.
# Ports 8081 (iOS) and 8082 (Android) are the two ports the eval harness
# reserves. Do not SIGKILL unrelated listeners on those ports.
kill_fixture_listeners 8081 "$WORKSPACE"
kill_fixture_listeners 8082 "$WORKSPACE"

# Per-fixture heavy dirs — all gitignored / regenerable (node_modules, the
# prebuilt native projects incl. iOS Pods and Android Gradle output, caches).
rm -rf \
  "$APP_RESOLVED/node_modules" \
  "$APP_RESOLVED/ios" \
  "$APP_RESOLVED/android" \
  "$APP_RESOLVED/.expo" \
  "$APP_RESOLVED/dist" \
  "$APP_RESOLVED/web-build" 2>/dev/null || true

# iOS DerivedData for fixture builds. create-expo-app names the project
# "fixture", so its build output lives under DerivedData/fixture-<hash>. This is
# a cache (worst case a rebuild), so it's safe to drop between fixtures.
if [[ "${EXPO_SKILL_EVAL_KEEP_DERIVEDDATA:-0}" != "1" ]]; then
  DD="$HOME/Library/Developer/Xcode/DerivedData"
  [[ -d "$DD" ]] && rm -rf "$DD"/fixture-* 2>/dev/null || true
fi

echo "cleaned fixture: $APP_RESOLVED"

#!/bin/bash
set -euo pipefail

if [[ "${CI_XCODEBUILD_ACTION:-}" != archive || -z "${CI_APP_STORE_SIGNED_APP_PATH:-}" ]]; then
    exit 0
fi

export_path="$CI_APP_STORE_SIGNED_APP_PATH"
if [[ -f "$export_path/Nest.ipa" ]]; then
    extracted="$(mktemp -d)"
    trap 'rm -rf "$extracted"' EXIT
    ditto -x -k "$export_path/Nest.ipa" "$extracted"
    app="$extracted/Payload/Nest.app"
elif [[ -d "$export_path/Nest.app" ]]; then
    app="$export_path/Nest.app"
else
    printf 'TestFlight export must contain Nest.ipa or Nest.app.\n' >&2
    exit 1
fi

if [[ ! -d "$app" ]]; then
    printf 'TestFlight export is missing Nest.app.\n' >&2
    exit 1
fi

while read -r key expected; do
    if ! value="$(plutil -extract "$key" raw -o - "$app/Info.plist")"; then
        printf 'TestFlight configuration is missing %s.\n' "$key" >&2
        exit 1
    fi
    case "$value" in
        $expected) ;;
        *)
            printf 'TestFlight configuration mismatch for %s.\n' "$key" >&2
            exit 1
            ;;
    esac
done <<'EXPECTATIONS'
NEST_PUSH_ENABLED true
NEST_APNS_ENVIRONMENT production
NEST_API_URL https://*
NEST_SUPABASE_URL https://*
NEST_SUPABASE_PUBLISHABLE_KEY sb_publishable_*
EXPECTATIONS

python3 "$CI_PRIMARY_REPOSITORY_PATH/scripts/verify-native-push-signing.py" "$app" --testflight

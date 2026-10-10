#!/usr/bin/env bash

set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_path="${1:-${root_dir}/src-tauri/target/release/bundle/macos/见字·如面.app}"
entitlements_path="${root_dir}/src-tauri/Entitlements.plist"

if [[ ! -d "${app_path}" ]]; then
  echo "Missing application bundle: ${app_path}" >&2
  exit 1
fi

if [[ -n "${MACOS_CODESIGN_IDENTITY:-}" ]]; then
  signing_identity="${MACOS_CODESIGN_IDENTITY}"
elif [[ "${CI:-}" == "true" ]]; then
  signing_identity="-"
else
  signing_identity="$("${root_dir}/scripts/ensure-local-macos-signing.sh" --identity)"
  signing_keychain="$("${root_dir}/scripts/ensure-local-macos-signing.sh" --keychain)"
fi

codesign_args=(
  --force
  --deep
  --options runtime
  --timestamp=none
  --identifier com.interviewatlas.desktop
  --sign "${signing_identity}"
  --entitlements "${entitlements_path}"
)
if [[ -n "${signing_keychain:-}" ]]; then
  codesign_args+=(--keychain "${signing_keychain}")
fi
codesign "${codesign_args[@]}" "${app_path}"
codesign --verify --deep --strict "${app_path}"

actual_identifier="$(
  codesign -dvv "${app_path}" 2>&1 |
    awk -F= '/^Identifier=/ && !found { print $2; found = 1 }'
)"
if [[ "${actual_identifier}" != "com.interviewatlas.desktop" ]]; then
  echo "Unexpected signed application identifier: ${actual_identifier}" >&2
  exit 1
fi

echo "Signed ${app_path}"

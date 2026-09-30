#!/usr/bin/env bash

set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_name="千面"
version="$(node -p "require('${root_dir}/package.json').version")"
architecture="$(uname -m)"

if [[ "${architecture}" == "arm64" ]]; then
  architecture="aarch64"
fi

app_path="${root_dir}/src-tauri/target/release/bundle/macos/${app_name}.app"
dmg_dir="${root_dir}/src-tauri/target/release/bundle/dmg"
dmg_path="${dmg_dir}/${app_name}_${version}_${architecture}.dmg"
stage_dir="$(mktemp -d "${root_dir}/.dmg-stage.XXXXXX")"

cleanup() {
  rm -rf "${stage_dir}"
}
trap cleanup EXIT

if [[ ! -d "${app_path}" ]]; then
  echo "Missing application bundle: ${app_path}" >&2
  exit 1
fi

if ! codesign --verify --deep --strict "${app_path}" >/dev/null 2>&1; then
  codesign --force --deep --sign - "${app_path}"
fi

mkdir -p "${dmg_dir}"
ditto "${app_path}" "${stage_dir}/${app_name}.app"
ln -s /Applications "${stage_dir}/Applications"
rm -f "${dmg_path}"

hdiutil create \
  -volname "${app_name}" \
  -srcfolder "${stage_dir}" \
  -ov \
  -format UDZO \
  "${dmg_path}"

echo "Created ${dmg_path}"

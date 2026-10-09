#!/usr/bin/env bash

set -euo pipefail

root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
app_name="见字·如面"
source_path="${root_dir}/src-tauri/target/release/bundle/macos/${app_name}.app"
install_path="/Applications/${app_name}.app"

if [[ ! -d "${source_path}" ]]; then
  echo "Missing application bundle: ${source_path}" >&2
  exit 1
fi

"${root_dir}/scripts/sign-macos-app.sh" "${source_path}"

pkill -f '/见字·如面.app/Contents/MacOS/interview-atlas$' 2>/dev/null || true
rm -rf "${install_path}"
ditto "${source_path}" "${install_path}"
codesign --verify --deep --strict "${install_path}"
open "${install_path}"

echo "Installed ${install_path}"

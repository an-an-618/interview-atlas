#!/usr/bin/env bash

set -euo pipefail

identity_name="Interview Atlas Local Code Signing"
root_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
state_dir="${INTERVIEW_ATLAS_SIGNING_DIR:-${root_dir}/.local-macos-signing}"
keychain_path="${state_dir}/interview-atlas-local-signing.keychain-db"
password_path="${state_dir}/keychain-password"

mkdir -p "${state_dir}"
chmod 700 "${state_dir}"

if [[ ! -f "${password_path}" ]]; then
  umask 077
  openssl rand -hex 32 > "${password_path}"
fi
password="$(<"${password_path}")"

if [[ ! -f "${keychain_path}" ]]; then
  temp_dir="$(mktemp -d)"
  cleanup() {
    rm -rf "${temp_dir}"
  }
  trap cleanup EXIT

  security create-keychain -p "${password}" "${keychain_path}"
  security set-keychain-settings -lut 21600 "${keychain_path}"
  security unlock-keychain -p "${password}" "${keychain_path}"

  openssl req \
    -new \
    -newkey rsa:2048 \
    -x509 \
    -sha256 \
    -days 3650 \
    -nodes \
    -subj "/CN=${identity_name}/O=Interview Atlas Local Development" \
    -addext "basicConstraints=critical,CA:TRUE" \
    -addext "keyUsage=critical,digitalSignature,keyCertSign" \
    -addext "extendedKeyUsage=codeSigning" \
    -keyout "${temp_dir}/identity.key" \
    -out "${temp_dir}/identity.crt" \
    >/dev/null 2>&1
  openssl pkcs12 \
    -export \
    -inkey "${temp_dir}/identity.key" \
    -in "${temp_dir}/identity.crt" \
    -name "${identity_name}" \
    -passout "pass:${password}" \
    -out "${temp_dir}/identity.p12"

  security import "${temp_dir}/identity.p12" \
    -k "${keychain_path}" \
    -P "${password}" \
    -A \
    >/dev/null
  security add-trusted-cert \
    -r trustRoot \
    -k "${keychain_path}" \
    "${temp_dir}/identity.crt"
  security set-key-partition-list \
    -S apple-tool:,apple:,codesign: \
    -s \
    -k "${password}" \
    "${keychain_path}" \
    >/dev/null
fi

security unlock-keychain -p "${password}" "${keychain_path}"
search_keychains=()
while IFS= read -r listed_keychain; do
  listed_keychain="${listed_keychain#\"}"
  listed_keychain="${listed_keychain%\"}"
  [[ -n "${listed_keychain}" ]] && search_keychains+=("${listed_keychain}")
done < <(security list-keychains -d user | sed 's/^[[:space:]]*//')
if [[ ! " ${search_keychains[*]} " =~ " ${keychain_path} " ]]; then
  security list-keychains -d user -s "${search_keychains[@]}" "${keychain_path}"
fi
identity_hash="$(
  security find-identity -v -p codesigning "${keychain_path}" |
    awk -v name="${identity_name}" 'index($0, name) && !found { print $2; found = 1 }'
)"
if [[ -z "${identity_hash}" ]]; then
  echo "Local macOS signing identity is unavailable: ${identity_name}" >&2
  exit 1
fi

case "${1:---identity}" in
  --identity)
    printf '%s\n' "${identity_hash}"
    ;;
  --keychain)
    printf '%s\n' "${keychain_path}"
    ;;
  *)
    echo "Usage: $0 [--identity|--keychain]" >&2
    exit 2
    ;;
esac

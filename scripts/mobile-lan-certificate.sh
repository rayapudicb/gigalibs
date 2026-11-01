#!/usr/bin/env bash
# WI-OI-120cf: the certificate for the mobile pilot's local-network HTTPS address (infra/compose/compose.mobile-lan.yaml).
# Creates, once, a local certificate authority for this machine, then a server certificate for this Mac's network
# address (and its .local name when given), signed by it. The test phones install and trust ca.crt; nothing else does.
# Private keys stay in the output directory (outside the repository), readable by the owner only, and are never printed.
#
#   scripts/mobile-lan-certificate.sh <output directory> <network address> [<name>.local]
#
# Running it again keeps the authority (phones keep trusting it) and issues a new server certificate, e.g. after the
# network address changes.
set -euo pipefail

out="${1:?usage: mobile-lan-certificate.sh <output directory> <network address> [<name>.local]}"
address="${2:?usage: mobile-lan-certificate.sh <output directory> <network address> [<name>.local]}"
name="${3:-}"

if ! [[ "$address" =~ ^(10|172|192)\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}$ ]]; then
  echo "The address must be a private IPv4 network address (10.x, 172.x or 192.x), not $address." >&2
  exit 2
fi
if [[ -n "$name" && ! "$name" =~ ^[A-Za-z0-9-]+\.local$ ]]; then
  echo "The name must be a <name>.local host name." >&2
  exit 2
fi
case "$out" in
  "$(git rev-parse --show-toplevel 2>/dev/null || echo /nonexistent)"*) echo "Keep the certificate directory outside the repository." >&2; exit 2 ;;
esac

umask 077
mkdir -p "$out"
chmod 700 "$out"

if [[ ! -s "$out/ca.key" || ! -s "$out/ca.crt" ]]; then
  openssl ecparam -name prime256v1 -genkey -noout -out "$out/ca.key"
  openssl req -x509 -new -key "$out/ca.key" -sha256 -days 1095 -out "$out/ca.crt" \
    -subj "/O=GigaLibs mobile pilot/CN=GigaLibs mobile pilot local CA ($(hostname -s))" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" \
    -addext "subjectKeyIdentifier=hash"
  echo "Created a new local certificate authority: install $out/ca.crt on each test phone and trust it."
else
  echo "Kept the existing local certificate authority ($out/ca.crt)."
fi

san="IP:${address}"
[[ -n "$name" ]] && san="${san},DNS:${name}"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
openssl ecparam -name prime256v1 -genkey -noout -out "$work/server.key"
openssl req -new -key "$work/server.key" -out "$work/server.csr" -subj "/O=GigaLibs mobile pilot/CN=${name:-$address}"
cat > "$work/server.ext" <<EOF
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature
extendedKeyUsage=serverAuth
subjectAltName=${san}
subjectKeyIdentifier=hash
authorityKeyIdentifier=keyid
EOF
# 397 days: within the limit iOS and Android accept for server certificates.
openssl x509 -req -in "$work/server.csr" -CA "$out/ca.crt" -CAkey "$out/ca.key" -CAcreateserial -sha256 -days 397 \
  -extfile "$work/server.ext" -out "$work/server.crt" 2>/dev/null
openssl verify -CAfile "$out/ca.crt" "$work/server.crt" >/dev/null
mv "$work/server.key" "$out/server.key"
mv "$work/server.crt" "$out/server.crt"
# The proxy container runs as an unprivileged user and reads its key from a read-only mount.
chmod 644 "$out/ca.crt" "$out/server.crt"
chmod 640 "$out/server.key"
openssl x509 -in "$out/ca.crt" -outform der -out "$out/ca.cer"
chmod 644 "$out/ca.cer"

echo "Server certificate for ${san} until $(openssl x509 -in "$out/server.crt" -noout -enddate | cut -d= -f2)."
echo "CA fingerprint (check it on each phone): $(openssl x509 -in "$out/ca.crt" -noout -fingerprint -sha256 | cut -d= -f2)"

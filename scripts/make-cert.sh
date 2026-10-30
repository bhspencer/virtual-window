#!/usr/bin/env bash
# Generate a self-signed cert covering localhost plus every global IPv4 address
# on this machine. getUserMedia only runs in a secure context, so reaching the
# app from a phone over the LAN requires HTTPS even on a private network.
set -euo pipefail

cd "$(dirname "$0")/.."
mkdir -p certs

# Linux has iproute2; macOS only has ifconfig. This script needs to run on both,
# since the app may be served from the VM or from the Mac itself.
if command -v ip >/dev/null 2>&1; then
    ips=$(ip -4 -o addr show scope global | awk '{print $4}' | cut -d/ -f1)
else
    ips=$(ifconfig | awk '/inet /{print $2}' | grep -v '^127\.')
fi

alt="DNS:localhost,IP:127.0.0.1"
for ip in $ips; do
    alt="$alt,IP:$ip"
done

echo "Issuing cert for: $alt"

openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout certs/key.pem \
    -out certs/cert.pem \
    -days 825 \
    -subj "/CN=virtual-window" \
    -addext "subjectAltName=$alt" \
    -addext "basicConstraints=CA:FALSE" \
    -addext "keyUsage=digitalSignature,keyEncipherment" \
    -addext "extendedKeyUsage=serverAuth" \
    2>/dev/null

chmod 600 certs/key.pem
echo "Wrote certs/cert.pem and certs/key.pem"

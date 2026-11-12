#!/bin/bash
# Empaqueta MiTV webOS como .ipk, replicando lo que hace ares-package
# (el CLI no se pudo instalar por npm: EPERM en chown).
# Layout: ar con debian-binary + control.tar.gz + data.tar.gz
set -e
APP_ID="com.mitv.webos"
VERSION="1.0.0"
SRC="$HOME/workspace/mitv-webos/app"
SERVICE_SRC="$HOME/workspace/mitv-webos/service/com.mitv.webos.fetch"
OUT="$HOME/workspace/mitv-webos"
WORK=$(mktemp -d)
trap "rm -rf $WORK" EXIT
mkdir -p "$WORK/data/usr/palm/applications/$APP_ID"
mkdir -p "$WORK/data/usr/palm/packages/$APP_ID"
mkdir -p "$WORK/data/usr/palm/services/com.mitv.webos.fetch"
mkdir -p "$WORK/ctrl"
cp -a "$SRC/." "$WORK/data/usr/palm/applications/$APP_ID/"
cp -a "$SERVICE_SRC/." "$WORK/data/usr/palm/services/com.mitv.webos.fetch/"
printf '{\n  "id": "%s",\n  "version": "%s",\n  "app": "%s"\n}\n' "$APP_ID" "$VERSION" "$APP_ID" > "$WORK/data/usr/palm/packages/$APP_ID/packageinfo.json"
SIZE_KB=$(du -sk "$WORK/data" | cut -f1)
{
  echo "Package: $APP_ID"
  echo "Version: $VERSION"
  echo "Section: misc"
  echo "Priority: optional"
  echo "Architecture: all"
  echo "Installed-Size: $SIZE_KB"
  echo "Maintainer: N/A <nobody@example.com>"
  echo "Description: This is a webOS application."
  echo "webOS-Package-Format-Version: 2"
  echo "webOS-Packager-Version: x.y.x"
  echo ""
} > "$WORK/ctrl/control"
printf '2.0\n' > "$WORK/debian-binary"
(cd "$WORK/data" && tar --format=ustar -czf "$WORK/data.tar.gz" usr)
(cd "$WORK/ctrl" && tar --format=ustar -czf "$WORK/control.tar.gz" control)
cd "$WORK"
IPK="$OUT/${APP_ID}_${VERSION}_all.ipk"
rm -f "$IPK"
ar -q "$IPK" debian-binary control.tar.gz data.tar.gz
ls -la "$IPK"
echo "--- contenido del ar ---"
ar t "$IPK"

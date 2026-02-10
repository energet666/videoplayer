#!/bin/bash

ICON_SOURCE="build/icon.png"
ICONSET_DIR="build/icon.iconset"

if [ ! -f "$ICON_SOURCE" ]; then
    echo "Error: $ICON_SOURCE does not exist."
    exit 1
fi

mkdir -p "$ICONSET_DIR"

# Generate ICNS
echo "Generating iconset..."
sips -z 16 16     "$ICON_SOURCE" --out "$ICONSET_DIR/icon_16x16.png"
sips -z 32 32     "$ICON_SOURCE" --out "$ICONSET_DIR/icon_16x16@2x.png"
sips -z 32 32     "$ICON_SOURCE" --out "$ICONSET_DIR/icon_32x32.png"
sips -z 64 64     "$ICON_SOURCE" --out "$ICONSET_DIR/icon_32x32@2x.png"
sips -z 128 128   "$ICON_SOURCE" --out "$ICONSET_DIR/icon_128x128.png"
sips -z 256 256   "$ICON_SOURCE" --out "$ICONSET_DIR/icon_128x128@2x.png"
sips -z 256 256   "$ICON_SOURCE" --out "$ICONSET_DIR/icon_256x256.png"
sips -z 512 512   "$ICON_SOURCE" --out "$ICONSET_DIR/icon_256x256@2x.png"
sips -z 512 512   "$ICON_SOURCE" --out "$ICONSET_DIR/icon_512x512.png"
sips -z 1024 1024 "$ICON_SOURCE" --out "$ICONSET_DIR/icon_512x512@2x.png"

echo "Creating .icns file..."
iconutil -c icns "$ICONSET_DIR" -o build/icon.icns

# Generate ICO using ffmpeg if available
if command -v ffmpeg &> /dev/null; then
    echo "Creating .ico file..."
    ffmpeg -y -i "$ICON_SOURCE" -vf scale=256:256 build/icon.ico
else
    echo "ffmpeg not found, skipping .ico generation."
fi

# Cleanup
rm -rf "$ICONSET_DIR"
echo "Done!"

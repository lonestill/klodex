#!/usr/bin/env bash
# ==============================================================================
# Klodex macOS Standalone App & DMG Builder
# Generates a self-contained macOS .app bundle and distributable .dmg disk image
# ==============================================================================

set -euo pipefail

# ANSI color codes
C_RESET="\033[0m"
C_BOLD="\033[1m"
C_CYAN="\033[38;5;51m"
C_VIOLET="\033[38;5;141m"
C_GREEN="\033[38;5;48m"
C_YELLOW="\033[38;5;220m"
C_RED="\033[38;5;196m"
C_DIM="\033[38;5;244m"

log_step() {
  printf "  ${C_VIOLET}%s${C_RESET}  ${C_BOLD}%s${C_RESET}\n" "$1" "$2"
}

log_ok() {
  printf "  ${C_GREEN}✔${C_RESET}  %s\n" "$*"
}

log_error() {
  printf "  ${C_RED}✖${C_RESET}  %s\n" "$*" >&2
}

# Verify running on macOS
if [ "$(uname -s)" != "Darwin" ]; then
  log_error "Скрипт создания DMG предназначен исключительно для macOS."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

ARCH="$(uname -m)"
VERSION=$(grep -m1 '"version":' package.json | sed -E 's/.*"version": *"([^"]+)".*/\1/' || echo "1.0.0")

printf "\n"
printf "${C_CYAN}  ██╗  ██╗${C_VIOLET}██╗      ██████╗ ██████╗ ███████╗██╗  ██╗${C_RESET}\n"
printf "${C_CYAN}  ██║ ██╔╝${C_VIOLET}██║     ██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝${C_RESET}\n"
printf "${C_CYAN}  █████╔╝ ${C_VIOLET}██║     ██║   ██║██║  ██║█████╗   ╚███╔╝ ${C_RESET}\n"
printf "${C_CYAN}  ██╔═██╗ ${C_VIOLET}██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗ ${C_RESET}\n"
printf "${C_CYAN}  ██║  ██╗${C_VIOLET}███████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗${C_RESET}\n"
printf "${C_CYAN}  ╚═╝  ╚═╝${C_VIOLET}╚══════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝${C_RESET}\n"
printf "  ${C_DIM}macOS Disk Image Builder (v${VERSION} • ${ARCH})${C_RESET}\n\n"

DIST_DIR="$ROOT_DIR/dist"
STAGING_DIR="$DIST_DIR/dmg-staging"
APP_DIR="$STAGING_DIR/Klodex.app"
DMG_NAME="Klodex-${VERSION}-macOS-${ARCH}.dmg"
DMG_PATH="$DIST_DIR/$DMG_NAME"
LATEST_DMG_PATH="$DIST_DIR/Klodex-macOS.dmg"

# 1. Clean previous build staging
rm -rf "$STAGING_DIR" "$DMG_PATH" "$LATEST_DMG_PATH"
mkdir -p "$STAGING_DIR" "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

# 2. Build web-ui if needed
log_step "[1/5]" "Компиляция веб-интерфейса Klodex..."
bun run build > /dev/null
log_ok "Веб-интерфейс скомпилирован в web-ui/dist"

# 3. Compile standalone Mach-O binary via Bun
log_step "[2/5]" "Сборка нативного бинарника Klodex (${ARCH})..."
bun build --compile --minify src/index.ts --outfile "$APP_DIR/Contents/MacOS/klodex" > /dev/null
chmod +x "$APP_DIR/Contents/MacOS/klodex"
log_ok "Нативный Mach-O бинарник создан: Contents/MacOS/klodex"

# 4. Copy resources & Info.plist
log_step "[3/5]" "Упаковка ресурсов и иконки приложения..."
cp -R "web-ui/dist" "$APP_DIR/Contents/Resources/dist"

if [ -f "assets/AppIcon.icns" ]; then
  cp "assets/AppIcon.icns" "$APP_DIR/Contents/Resources/AppIcon.icns"
fi

cat <<EOF > "$APP_DIR/Contents/Info.plist"
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleExecutable</key>
  <string>klodex</string>
  <key>CFBundleIconFile</key>
  <string>AppIcon</string>
  <key>CFBundleIdentifier</key>
  <string>com.lonestill.klodex</string>
  <key>CFBundleName</key>
  <string>Klodex</string>
  <key>CFBundleDisplayName</key>
  <string>Klodex</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${VERSION}</string>
  <key>CFBundleVersion</key>
  <string>${VERSION}</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
  <key>NSHumanReadableCopyright</key>
  <string>Copyright © 2026 lonestill. All rights reserved.</string>
</dict>
</plist>
EOF

# Strip extended attributes and quarantine flags
xattr -cr "$APP_DIR" 2>/dev/null || true
log_ok "Бандл Klodex.app собран и верифицирован"

# 5. Create Applications symlink inside DMG staging
log_step "[4/5]" "Создание разметки DMG-диска..."
ln -s /Applications "$STAGING_DIR/Applications"
log_ok "Симлинк на /Applications подготовлен"

# 6. Build DMG disk image via hdiutil
log_step "[5/5]" "Генерация сжатого DMG-образа..."
hdiutil create \
  -volname "Klodex" \
  -srcfolder "$STAGING_DIR" \
  -ov \
  -format UDZO \
  "$DMG_PATH" > /dev/null

ln -sf "$DMG_PATH" "$LATEST_DMG_PATH"

# Cleanup staging
rm -rf "$STAGING_DIR"

DMG_SIZE=$(ls -lh "$DMG_PATH" | awk '{print $5}')

printf "\n"
printf "  ${C_GREEN}╭─────────────────────────────────────────────────────────────╮${C_RESET}\n"
printf "  ${C_GREEN}│${C_RESET}  ${C_BOLD}DMG-ОБРАЗ KLODEX УСПЕШНО СОБРАН${C_RESET}                           ${C_GREEN}│${C_RESET}\n"
printf "  ${C_GREEN}├─────────────────────────────────────────────────────────────┤${C_RESET}\n"
printf "  ${C_GREEN}│${C_RESET}  Файл:   ${C_CYAN}%-49s${C_RESET}  ${C_GREEN}│${C_RESET}\n" "$DMG_NAME"
printf "  ${C_GREEN}│${C_RESET}  Размер: %-49s  ${C_GREEN}│${C_RESET}\n" "$DMG_SIZE"
printf "  ${C_GREEN}│${C_RESET}  Путь:   ${C_DIM}%-49s${C_RESET}  ${C_GREEN}│${C_RESET}\n" "dist/$DMG_NAME"
printf "  ${C_GREEN}│${C_RESET}                                                             ${C_GREEN}│${C_RESET}\n"
printf "  ${C_GREEN}│${C_RESET}  ${C_BOLD}Установка:${C_RESET} дважды кликни по .dmg и перетяни            ${C_GREEN}│${C_RESET}\n"
printf "  ${C_GREEN}│${C_RESET}  ${C_CYAN}Klodex.app${C_RESET} в папку ${C_CYAN}Applications${C_RESET}.                          ${C_GREEN}│${C_RESET}\n"
printf "  ${C_GREEN}╰─────────────────────────────────────────────────────────────╯${C_RESET}\n\n"

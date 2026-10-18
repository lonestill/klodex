#!/usr/bin/env bash
# ==============================================================================
# Klodex Universal Installer for macOS and Linux
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/lonestill/klodex/main/install.sh | bash
# ==============================================================================

set -euo pipefail

# Colors
C_RESET="\033[0m"
C_BOLD="\033[1m"
C_CYAN="\033[36m"
C_GREEN="\033[32m"
C_YELLOW="\033[33m"
C_RED="\033[31m"
C_DIM="\033[90m"

log_info() {
  printf "  ${C_CYAN}➜${C_RESET}  %s\n" "$*"
}

log_ok() {
  printf "  ${C_GREEN}✓${C_RESET}  %s\n" "$*"
}

log_warn() {
  printf "  ${C_YELLOW}!${C_RESET}  %s\n" "$*"
}

log_error() {
  printf "  ${C_RED}✗${C_RESET}  %s\n" "$*" >&2
}

banner() {
  cat <<'EOF'

   ██╗  ██╗██╗      ██████╗ ██████╗ ███████╗██╗  ██╗
   ██║ ██╔╝██║     ██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝
   █████╔╝ ██║     ██║   ██║██║  ██║█████╗   ╚███╔╝ 
   ██╔═██╗ ██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗ 
   ██║  ██╗███████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗
   ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
   Автономный кодинг-агент для разработки

EOF
}

banner

INSTALL_DIR="${KLODEX_INSTALL_DIR:-$HOME/.klodex}"
BIN_DIR="$HOME/.local/bin"
REPO_URL="https://github.com/lonestill/klodex.git"
TARBALL_URL="https://github.com/lonestill/klodex/archive/refs/heads/main.tar.gz"

# 1. Detect OS & Architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    PLATFORM="macOS"
    ;;
  Linux)
    PLATFORM="Linux"
    ;;
  *)
    log_error "Неподдерживаемая ОС: $OS. Для Windows используйте install.ps1."
    exit 1
    ;;
esac

log_info "Окружение: ${C_BOLD}${PLATFORM} (${ARCH})${C_RESET}"

# 2. Check or install Bun
BUN_BIN=""
if command -v bun >/dev/null 2>&1; then
  BUN_BIN="$(command -v bun)"
  log_ok "Bun найден: $(bun --version) (${BUN_BIN})"
elif [ -x "$HOME/.bun/bin/bun" ]; then
  BUN_BIN="$HOME/.bun/bin/bun"
  export PATH="$HOME/.bun/bin:$PATH"
  log_ok "Bun найден в ~/.bun/bin: $($BUN_BIN --version)"
else
  log_info "Bun не установлен. Устанавливаю официальный бинарник Bun..."
  curl -fsSL https://bun.sh/install | bash
  export PATH="$HOME/.bun/bin:$PATH"
  if [ -x "$HOME/.bun/bin/bun" ]; then
    BUN_BIN="$HOME/.bun/bin/bun"
    log_ok "Bun успешно установлен: $($BUN_BIN --version)"
  else
    log_error "Не удалось установить Bun автоматически. Установите Bun вручную: https://bun.sh"
    exit 1
  fi
fi

# 3. Download or update Klodex repository
mkdir -p "$INSTALL_DIR"

if command -v git >/dev/null 2>&1; then
  if [ -d "$INSTALL_DIR/.git" ]; then
    log_info "Обновляю существующую установку в ${INSTALL_DIR}..."
    git -C "$INSTALL_DIR" fetch --depth=1 origin main
    git -C "$INSTALL_DIR" reset --hard origin/main
  else
    log_info "Клонирую репозиторий через Git..."
    rm -rf "$INSTALL_DIR"
    git clone --depth=1 "$REPO_URL" "$INSTALL_DIR"
  fi
else
  log_info "Git не обнаружен. Загружаю исходный архив проекта напрямую..."
  TMP_TAR="$(mktemp /tmp/klodex-src-XXXXXX.tar.gz)"
  TMP_DIR="$(mktemp -d /tmp/klodex-extract-XXXXXX)"

  if command -v curl >/dev/null 2>&1; then
    curl -fsSL "$TARBALL_URL" -o "$TMP_TAR"
  elif command -v wget >/dev/null 2>&1; then
    wget -qO "$TMP_TAR" "$TARBALL_URL"
  else
    log_error "Для загрузки требуется curl или wget."
    exit 1
  fi

  tar -xzf "$TMP_TAR" -C "$TMP_DIR"
  EXTRACTED_DIR="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

  if [ -z "$EXTRACTED_DIR" ] || [ ! -d "$EXTRACTED_DIR" ]; then
    log_error "Не удалось извлечь архив проекта."
    rm -f "$TMP_TAR"
    rm -rf "$TMP_DIR"
    exit 1
  fi

  mkdir -p "$INSTALL_DIR"
  cp -R "$EXTRACTED_DIR/." "$INSTALL_DIR/"
  rm -f "$TMP_TAR"
  rm -rf "$TMP_DIR"
  log_ok "Архив успешно распакован в ${INSTALL_DIR}"
fi

# 4. Install dependencies & build frontend
log_info "Устанавливаю зависимости проекта..."
(cd "$INSTALL_DIR" && "$BUN_BIN" install)
(cd "$INSTALL_DIR/web-ui" && "$BUN_BIN" install)

log_info "Компилирую веб-интерфейс..."
(cd "$INSTALL_DIR" && "$BUN_BIN" run build)

# 5. Create launcher binary in ~/.local/bin
mkdir -p "$BIN_DIR"
LAUNCHER="$BIN_DIR/klodex"

cat <<EOF > "$LAUNCHER"
#!/usr/bin/env bash
# Klodex CLI launcher wrapper
export KLODEX_DIR="$INSTALL_DIR"
if [ -x "\$HOME/.bun/bin/bun" ]; then
  export PATH="\$HOME/.bun/bin:\$PATH"
fi
exec "\${BUN_BIN:-bun}" run --cwd "\$KLODEX_DIR" start "\$@"
EOF

chmod +x "$LAUNCHER"
log_ok "Бинарный лаунчер создан: ${LAUNCHER}"

# 6. Ensure ~/.local/bin is in PATH
add_path_if_missing() {
  local file="$1"
  local line='export PATH="$HOME/.local/bin:$PATH"'
  if [ -f "$file" ]; then
    if ! grep -q "HOME/.local/bin" "$file"; then
      echo "" >> "$file"
      echo "# Klodex CLI" >> "$file"
      echo "$line" >> "$file"
      log_ok "Добавлен ~/.local/bin в PATH (${file})"
    fi
  fi
}

add_path_if_missing "$HOME/.bashrc"
add_path_if_missing "$HOME/.zshrc"
add_path_if_missing "$HOME/.profile"

# Fish shell support
if [ -d "$HOME/.config/fish" ]; then
  FISH_CONF="$HOME/.config/fish/config.fish"
  if [ -f "$FISH_CONF" ] && ! grep -q ".local/bin" "$FISH_CONF"; then
    echo "fish_add_path \$HOME/.local/bin" >> "$FISH_CONF"
    log_ok "Добавлен ~/.local/bin в fish_add_path"
  fi
fi

# 7. Optional macOS .app bundle shortcut
if [ "$PLATFORM" = "macOS" ]; then
  APP_DIR="$HOME/Applications/Klodex.app"
  mkdir -p "$APP_DIR/Contents/MacOS" "$APP_DIR/Contents/Resources"

  APP_VERSION=$(grep -m1 '"version":' "$INSTALL_DIR/package.json" | sed -E 's/.*"version": *"([^"]+)".*/\1/' 2>/dev/null || echo "1.0.0")

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
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${APP_VERSION}</string>
  <key>LSMinimumSystemVersion</key>
  <string>11.0</string>
  <key>NSHighResolutionCapable</key>
  <true/>
</dict>
</plist>
EOF

  cat <<EOF > "$APP_DIR/Contents/MacOS/klodex"
#!/usr/bin/env bash
export PATH="\$HOME/.local/bin:\$HOME/.bun/bin:/usr/local/bin:\$PATH"
exec "\$HOME/.local/bin/klodex" --open
EOF
  chmod +x "$APP_DIR/Contents/MacOS/klodex"
  if [ -f "$INSTALL_DIR/assets/AppIcon.icns" ]; then
    cp "$INSTALL_DIR/assets/AppIcon.icns" "$APP_DIR/Contents/Resources/AppIcon.icns"
  fi
  log_ok "Создано macOS приложение: ~/Applications/Klodex.app"
fi


printf "\n"
printf "${C_GREEN}${C_BOLD}✓ Klodex успешно установлен!${C_RESET}\n\n"
printf "  Запуск сервера и интерфейса:\n"
printf "    ${C_CYAN}klodex${C_RESET}          — запустить в текущей папке\n"
printf "    ${C_CYAN}klodex --open${C_RESET}   — запустить и сразу открыть в браузере\n"
printf "    ${C_CYAN}klodex -p 4646${C_RESET}  — указать порт\n\n"
printf "  ${C_DIM}Если команда 'klodex' не найдена, перезапустите терминал или выполните:${C_RESET}\n"
printf "    ${C_DIM}source ~/.zshrc (или ~/.bashrc)${C_RESET}\n\n"

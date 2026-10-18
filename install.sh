#!/usr/bin/env bash
# ==============================================================================
# Klodex Universal Installer for macOS and Linux
# One-liner:
#   curl -fsSL https://raw.githubusercontent.com/lonestill/klodex/main/install.sh | bash
# ==============================================================================

set -euo pipefail

# Colors & Typography
C_RESET="\033[0m"
C_BOLD="\033[1m"
C_DIM="\033[38;5;244m"
C_CYAN="\033[38;5;51m"
C_VIOLET="\033[38;5;141m"
C_GREEN="\033[38;5;48m"
C_YELLOW="\033[38;5;220m"
C_RED="\033[38;5;196m"

# Cursor restoration on exit/interrupt
cleanup() {
  tput cnorm 2>/dev/null || true
}
trap cleanup EXIT INT TERM

log_step() {
  printf "  ${C_VIOLET}%s${C_RESET}  ${C_BOLD}%s${C_RESET}\n" "$1" "$2"
}

log_info() {
  printf "      ${C_DIM}➜${C_RESET}  %s\n" "$*"
}

log_ok() {
  printf "      ${C_GREEN}✔${C_RESET}  %s\n" "$*"
}

log_warn() {
  printf "      ${C_YELLOW}!${C_RESET}  %s\n" "$*"
}

log_error() {
  printf "      ${C_RED}✖${C_RESET}  %s\n" "$*" >&2
}

# Spinner for background operations
run_with_spinner() {
  local msg="$1"
  shift
  local log_file
  log_file="$(mktemp /tmp/klodex-install-XXXXXX.log)"

  ("$@") > "$log_file" 2>&1 &
  local pid=$!
  local spin_chars=("⠋" "⠙" "⠹" "⠸" "⠼" "⠴" "⠦" "⠧" "⠇" "⠏")
  local i=0

  if [ -t 1 ]; then
    tput civis 2>/dev/null || true
    while kill -0 "$pid" 2>/dev/null; do
      printf "\r      ${C_CYAN}%s${C_RESET}  %s" "${spin_chars[i]}" "$msg"
      i=$(( (i + 1) % ${#spin_chars[@]} ))
      sleep 0.08
    done
    tput cnorm 2>/dev/null || true
  fi

  wait "$pid"
  local exit_code=$?

  if [ $exit_code -eq 0 ]; then
    if [ -t 1 ]; then
      printf "\r      ${C_GREEN}✔${C_RESET}  %s\n" "$msg"
    else
      log_ok "$msg"
    fi
    rm -f "$log_file"
    return 0
  else
    if [ -t 1 ]; then
      printf "\r      ${C_RED}✖${C_RESET}  %s (ошибка)\n" "$msg"
    else
      log_error "$msg (ошибка)"
    fi
    cat "$log_file" >&2
    rm -f "$log_file"
    return $exit_code
  fi
}

banner() {
  cat <<'EOF'

  ██╗  ██╗██╗      ██████╗ ██████╗ ███████╗██╗  ██╗
  ██║ ██╔╝██║     ██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝
  █████╔╝ ██║     ██║   ██║██║  ██║█████╗   ╚███╔╝ 
  ██╔═██╗ ██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗ 
  ██║  ██╗███████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗
  ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
  Autonomous Agentic Coding Workspace for macOS & Linux

EOF
}

printf "${C_CYAN}"
banner
printf "${C_RESET}"

INSTALL_DIR="${KLODEX_INSTALL_DIR:-$HOME/.klodex}"
BIN_DIR="$HOME/.local/bin"
REPO_URL="https://github.com/lonestill/klodex.git"
TARBALL_URL="https://github.com/lonestill/klodex/archive/refs/heads/main.tar.gz"

# Step 1: Detect Platform
log_step "[1/6]" "Системная диагностика..."
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin)
    if [ "$ARCH" = "arm64" ]; then
      PLATFORM_DESC="macOS Apple Silicon (arm64)"
    else
      PLATFORM_DESC="macOS Intel (x86_64)"
    fi
    PLATFORM="macOS"
    ;;
  Linux)
    PLATFORM_DESC="Linux ($ARCH)"
    PLATFORM="Linux"
    ;;
  *)
    log_error "Неподдерживаемая ОС: $OS. Для Windows используйте install.ps1."
    exit 1
    ;;
esac
log_ok "Платформа: ${PLATFORM_DESC}"

# Step 2: Runtime Bun
log_step "[2/6]" "Проверка рантайма Bun..."
BUN_BIN=""
if command -v bun >/dev/null 2>&1; then
  BUN_BIN="$(command -v bun)"
  log_ok "Обнаружен Bun: $($BUN_BIN --version) (${BUN_BIN})"
elif [ -x "$HOME/.bun/bin/bun" ]; then
  BUN_BIN="$HOME/.bun/bin/bun"
  export PATH="$HOME/.bun/bin:$PATH"
  log_ok "Обнаружен Bun в ~/.bun/bin: $($BUN_BIN --version)"
elif [ -x "/opt/homebrew/bin/bun" ]; then
  BUN_BIN="/opt/homebrew/bin/bun"
  export PATH="/opt/homebrew/bin:$PATH"
  log_ok "Обнаружен Bun в Homebrew: $($BUN_BIN --version)"
else
  log_info "Bun не найден. Загружаю официальный бинарник Bun..."
  run_with_spinner "Установка официального дистрибутива Bun" bash -c "curl -fsSL https://bun.sh/install | bash"
  export PATH="$HOME/.bun/bin:$PATH"
  if [ -x "$HOME/.bun/bin/bun" ]; then
    BUN_BIN="$HOME/.bun/bin/bun"
    log_ok "Bun успешно установлен: $($BUN_BIN --version)"
  else
    log_error "Автоматическая установка Bun не удалась. Установите вручную: https://bun.sh"
    exit 1
  fi
fi

# Step 3: Fetch Klodex
log_step "[3/6]" "Загрузка ядра Klodex..."
mkdir -p "$INSTALL_DIR"

if command -v git >/dev/null 2>&1; then
  if [ -d "$INSTALL_DIR/.git" ]; then
    run_with_spinner "Обновление существующей кодовой базы Klodex" bash -c "git -C '$INSTALL_DIR' fetch --depth=1 origin main && git -C '$INSTALL_DIR' reset --hard origin/main"
  else
    rm -rf "$INSTALL_DIR"
    run_with_spinner "Клонирование репозитория lonestill/klodex" git clone --depth=1 "$REPO_URL" "$INSTALL_DIR"
  fi
else
  TMP_TAR="$(mktemp /tmp/klodex-src-XXXXXX.tar.gz)"
  TMP_DIR="$(mktemp -d /tmp/klodex-extract-XXXXXX)"

  if command -v curl >/dev/null 2>&1; then
    run_with_spinner "Загрузка исходного архива репозитория" curl -fsSL "$TARBALL_URL" -o "$TMP_TAR"
  elif command -v wget >/dev/null 2>&1; then
    run_with_spinner "Загрузка исходного архива репозитория" wget -qO "$TMP_TAR" "$TARBALL_URL"
  else
    log_error "Для загрузки требуется curl или wget."
    exit 1
  fi

  tar -xzf "$TMP_TAR" -C "$TMP_DIR"
  EXTRACTED_DIR="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"

  if [ -z "$EXTRACTED_DIR" ] || [ ! -d "$EXTRACTED_DIR" ]; then
    log_error "Не удалось распаковать архив проекта."
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

# Step 4: Install Dependencies & Build UI
log_step "[4/6]" "Сборка окружения и веб-интерфейса..."
run_with_spinner "Установка зависимостей бэкенда" bash -c "cd '$INSTALL_DIR' && '$BUN_BIN' install"
run_with_spinner "Установка зависимостей web-ui" bash -c "cd '$INSTALL_DIR/web-ui' && '$BUN_BIN' install"
run_with_spinner "Компиляция production UI бандла (Vite)" bash -c "cd '$INSTALL_DIR' && '$BUN_BIN' run build"

# Step 5: Install CLI wrapper
log_step "[5/6]" "Регистрация системной команды klodex..."
mkdir -p "$BIN_DIR"
LAUNCHER="$BIN_DIR/klodex"

cat <<EOF > "$LAUNCHER"
#!/usr/bin/env bash
# Klodex CLI launcher wrapper
export KLODEX_DIR="$INSTALL_DIR"
if [ -x "\$HOME/.bun/bin/bun" ]; then
  export PATH="\$HOME/.bun/bin:\$PATH"
elif [ -x "/opt/homebrew/bin/bun" ]; then
  export PATH="/opt/homebrew/bin:\$PATH"
fi
exec "\${BUN_BIN:-bun}" run --cwd "\$KLODEX_DIR" start "\$@"
EOF

chmod +x "$LAUNCHER"
log_ok "CLI лаунчер зарегистрирован: ${LAUNCHER}"

add_path_if_missing() {
  local file="$1"
  local line='export PATH="$HOME/.local/bin:$PATH"'
  if [ -f "$file" ]; then
    if ! grep -q "HOME/.local/bin" "$file"; then
      printf "\n# Klodex CLI\n%s\n" "$line" >> "$file"
      log_ok "Добавлен ~/.local/bin в PATH (${file})"
    fi
  fi
}

add_path_if_missing "$HOME/.bashrc"
add_path_if_missing "$HOME/.zshrc"
add_path_if_missing "$HOME/.profile"

if [ -d "$HOME/.config/fish" ]; then
  FISH_CONF="$HOME/.config/fish/config.fish"
  if [ -f "$FISH_CONF" ] && ! grep -q ".local/bin" "$FISH_CONF"; then
    echo "fish_add_path \$HOME/.local/bin" >> "$FISH_CONF"
    log_ok "Добавлен ~/.local/bin в fish_add_path"
  fi
fi

# Step 6: macOS Desktop App Integration
if [ "$PLATFORM" = "macOS" ]; then
  log_step "[6/6]" "Интеграция с macOS (Launchpad / Spotlight)..."
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
  <key>CFBundleDisplayName</key>
  <string>Klodex</string>
  <key>CFBundlePackageType</key>
  <string>APPL</string>
  <key>CFBundleShortVersionString</key>
  <string>${APP_VERSION}</string>
  <key>CFBundleVersion</key>
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
export PATH="\$HOME/.local/bin:\$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:\$PATH"
exec "\$HOME/.local/bin/klodex" --open
EOF
  chmod +x "$APP_DIR/Contents/MacOS/klodex"

  if [ -f "$INSTALL_DIR/assets/AppIcon.icns" ]; then
    cp "$INSTALL_DIR/assets/AppIcon.icns" "$APP_DIR/Contents/Resources/AppIcon.icns"
  fi

  xattr -cr "$APP_DIR" 2>/dev/null || true
  if [ -x "/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister" ]; then
    /System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -f "$APP_DIR" 2>/dev/null || true
  fi

  log_ok "Приложение создано: ~/Applications/Klodex.app"
else
  log_step "[6/6]" "Завершение установки..."
  log_ok "Конфигурация Linux завершена"
fi

printf "\n"
printf "  ${C_GREEN}╭─────────────────────────────────────────────────────────────╮${C_RESET}\n"
printf "  ${C_GREEN}│${C_RESET}  ${C_BOLD}KLODEX УСПЕШНО УСТАНОВЛЕН${C_RESET}                                   ${C_GREEN}│${C_RESET}\n"
printf "  ${C_GREEN}├─────────────────────────────────────────────────────────────┤${C_RESET}\n"
printf "  ${C_GREEN}│${C_RESET}  Запуск из терминала:                                       ${C_GREEN}│${C_RESET}\n"
printf "  ${C_GREEN}│${C_RESET}    ${C_CYAN}klodex${C_RESET}          Запустить в текущей папке проекта        ${C_GREEN}│${C_RESET}\n"
printf "  ${C_GREEN}│${C_RESET}    ${C_CYAN}klodex --open${C_RESET}   Запустить и сразу открыть в браузере     ${C_GREEN}│${C_RESET}\n"
printf "  ${C_GREEN}│${C_RESET}    ${C_CYAN}klodex -p 4646${C_RESET}  Запустить на кастомном порту             ${C_GREEN}│${C_RESET}\n"
printf "  ${C_GREEN}│${C_RESET}                                                             ${C_GREEN}│${C_RESET}\n"
if [ "$PLATFORM" = "macOS" ]; then
printf "  ${C_GREEN}│${C_RESET}  macOS приложение:                                          ${C_GREEN}│${C_RESET}\n"
printf "  ${C_GREEN}│${C_RESET}    ${C_VIOLET}~/Applications/Klodex.app${C_RESET} (доступно в Spotlight/Launchpad) ${C_GREEN}│${C_RESET}\n"
printf "  ${C_GREEN}│${C_RESET}                                                             ${C_GREEN}│${C_RESET}\n"
fi
printf "  ${C_GREEN}│${C_RESET}  ${C_DIM}Если команда 'klodex' не найдена, перезапусти терминал${C_RESET}     ${C_GREEN}│${C_RESET}\n"
printf "  ${C_GREEN}│${C_RESET}  ${C_DIM}или выполни: source ~/.zshrc (или ~/.bashrc)${C_RESET}               ${C_GREEN}│${C_RESET}\n"
printf "  ${C_GREEN}╰─────────────────────────────────────────────────────────────╯${C_RESET}\n\n"

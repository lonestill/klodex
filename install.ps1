# ==============================================================================
# Klodex Native Installer for Windows (PowerShell)
# One-liner:
#   irm https://raw.githubusercontent.com/lonestill/klodex/main/install.ps1 | iex
# ==============================================================================

$ErrorActionPreference = "Stop"

function Write-Step {
    param([string]$Message)
    Write-Host "  ➜  $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "  ✓  $Message" -ForegroundColor Green
}

function Write-Warn {
    param([string]$Message)
    Write-Host "  !  $Message" -ForegroundColor Yellow
}

function Write-Err {
    param([string]$Message)
    Write-Host "  ✗  $Message" -ForegroundColor Red
}

Write-Host @"

   ██╗  ██╗██╗      ██████╗ ██████╗ ███████╗██╗  ██╗
   ██║ ██╔╝██║     ██╔═══██╗██╔══██╗██╔════╝╚██╗██╔╝
   █████╔╝ ██║     ██║   ██║██║  ██║█████╗   ╚███╔╝ 
   ██╔═██╗ ██║     ██║   ██║██║  ██║██╔══╝   ██╔██╗ 
   ██║  ██╗███████╗╚██████╔╝██████╔╝███████╗██╔╝ ██╗
   ╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝
   Автономный кодинг-агент для разработки (Windows)

"@ -ForegroundColor White

$InstallDir = if ($env:KLODEX_INSTALL_DIR) { $env:KLODEX_INSTALL_DIR } else { "$env:USERPROFILE\.klodex" }
$BinDir = "$InstallDir\bin"
$RepoUrl = "https://github.com/lonestill/klodex.git"
$ZipUrl = "https://github.com/lonestill/klodex/archive/refs/heads/main.zip"

# 1. Check or install Bun
$bunCmd = Get-Command bun -ErrorAction SilentlyContinue
if (-not $bunCmd) {
    $userBun = "$env:USERPROFILE\.bun\bin\bun.exe"
    if (Test-Path $userBun) {
        $env:PATH = "$env:USERPROFILE\.bun\bin;$env:PATH"
        Write-Success "Bun обнаружен в $env:USERPROFILE\.bun\bin"
    } else {
        Write-Step "Bun не обнаружен. Устанавливаю официальный Bun для Windows..."
        try {
            powershell -c "irm bun.sh/install.ps1 | iex"
            $env:PATH = "$env:USERPROFILE\.bun\bin;$env:PATH"
            Write-Success "Bun успешно установлен."
        } catch {
            Write-Err "Не удалось установить Bun автоматически. Установите его с https://bun.sh"
            exit 1
        }
    }
} else {
    Write-Success "Bun найден: $(bun --version)"
}

# 2. Download or update Klodex repository
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
    if (Test-Path "$InstallDir\.git") {
        Write-Step "Обновляю Klodex через Git..."
        git -C $InstallDir fetch --depth=1 origin main
        git -C $InstallDir reset --hard origin/main
    } else {
        Write-Step "Клонирую репозиторий через Git..."
        Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue
        git clone --depth=1 $RepoUrl $InstallDir
    }
} else {
    Write-Step "Git не найден. Загружаю ZIP-архив проекта..."
    $tempZip = [System.IO.Path]::GetTempFileName() + ".zip"
    $tempExtract = Join-Path ([System.IO.Path]::GetTempPath()) ("klodex-ext-" + [System.Guid]::NewGuid().ToString().Substring(0,8))

    Invoke-WebRequest -Uri $ZipUrl -OutFile $tempZip -UseBasicParsing
    Expand-Archive -Path $tempZip -DestinationPath $tempExtract -Force

    $subDir = Get-ChildItem -Path $tempExtract -Directory | Select-Object -First 1
    if (-not $subDir) {
        Write-Err "Ошибка распаковки архива проекта."
        exit 1
    }

    Copy-Item -Path "$($subDir.FullName)\*" -Destination $InstallDir -Recurse -Force
    Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $tempExtract -Recurse -Force -ErrorAction SilentlyContinue
    Write-Success "Архив успешно распакован в $InstallDir"
}

# 3. Install dependencies & build UI
Write-Step "Устанавливаю зависимости проекта..."
Push-Location $InstallDir
try {
    bun install
    Write-Step "Компилирую веб-интерфейс..."
    bun run build
} finally {
    Pop-Location
}

# 4. Create launcher scripts in bin
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
}

# Windows CMD launcher
$cmdContent = @"
@echo off
if exist "%USERPROFILE%\.bun\bin\bun.exe" set "PATH=%USERPROFILE%\.bun\bin;%PATH%"
bun run --cwd "$InstallDir" start %*
"@
Set-Content -Path "$BinDir\klodex.cmd" -Value $cmdContent -Encoding ASCII

# PowerShell launcher
$psContent = @"
if (Test-Path "`$env:USERPROFILE\.bun\bin") { `$env:PATH = "`$env:USERPROFILE\.bun\bin;`$env:PATH" }
bun run --cwd "$InstallDir" start @args
"@
Set-Content -Path "$BinDir\klodex.ps1" -Value $psContent -Encoding UTF8

Write-Success "Лаунчер создан: $BinDir\klodex.cmd"

# 5. Add bin directory to user PATH
$userPath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::User)
if ($userPath -notlike "*$BinDir*") {
    $newPath = "$BinDir;$userPath"
    [Environment]::SetEnvironmentVariable("Path", $newPath, [EnvironmentVariableTarget]::User)
    $env:PATH = "$BinDir;$env:PATH"
    Write-Success "Папка $BinDir добавлена в переменную PATH пользователя."
}

# 6. Create Desktop shortcut
try {
    $desktopPath = [Environment]::GetFolderPath("Desktop")
    $shortcutPath = Join-Path $desktopPath "Klodex.lnk"
    $wshShell = New-Object -ComObject WScript.Shell
    $shortcut = $wshShell.CreateShortcut($shortcutPath)
    $shortcut.TargetPath = "$BinDir\klodex.cmd"
    $shortcut.Arguments = "--open"
    $shortcut.WorkingDirectory = $env:USERPROFILE
    $shortcut.Description = "Klodex — Автономный кодинг-агент"
    $shortcut.Save()
    Write-Success "Создан ярлык на рабочем столе: Klodex.lnk"
} catch {
    Write-Warn "Не удалось создать ярлык на рабочем столе (не критично)."
}

Write-Host "`n✓ Klodex успешно установлен!`n" -ForegroundColor Green
Write-Host "  Запуск сервера и интерфейса:" -ForegroundColor White
Write-Host "    klodex          " -NoNewline -ForegroundColor Cyan; Write-Host "— запустить в текущей папке" -ForegroundColor Gray
Write-Host "    klodex --open   " -NoNewline -ForegroundColor Cyan; Write-Host "— запустить и сразу открыть в браузере" -ForegroundColor Gray
Write-Host "    klodex -p 4646  " -NoNewline -ForegroundColor Cyan; Write-Host "— указать кастомный порт`n" -ForegroundColor Gray
Write-Host "  Если команда 'klodex' не распознается, перезапустите PowerShell/терминал.`n" -ForegroundColor DarkGray

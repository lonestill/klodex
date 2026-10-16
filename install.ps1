# ==============================================================================
# Klodex Native Installer for Windows (PowerShell)
# One-liner:
#   irm https://raw.githubusercontent.com/lonestill/klodex/main/install.ps1 | iex
# ==============================================================================

# 0. Enforce modern TLS & quiet progress (required for Windows PowerShell 5.1)
try {
    [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13
} catch {
    try {
        [System.Net.ServicePointManager]::SecurityProtocol = [System.Net.SecurityProtocolType]::Tls12
    } catch {}
}
$ProgressPreference = 'SilentlyContinue'

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
$userBunDir = "$env:USERPROFILE\.bun\bin"
$userBunExe = "$userBunDir\bun.exe"

# 1. Locate or install Bun
$bunBin = $null

if (Get-Command bun -ErrorAction SilentlyContinue) {
    $bunBin = (Get-Command bun -ErrorAction SilentlyContinue).Source
} elseif (Test-Path $userBunExe) {
    $bunBin = $userBunExe
    $env:PATH = "$userBunDir;$env:PATH"
}

if (-not $bunBin) {
    Write-Step "Bun не обнаружен. Начинаю установку Bun для Windows..."

    # Method 1: Official script from bun.sh
    try {
        Invoke-RestMethod -Uri "https://bun.sh/install.ps1" -UseBasicParsing | Invoke-Expression
    } catch {
        Write-Warn "Установка через bun.sh не удалась ($($_.Exception.Message)). Пробую резервный канал..."
    }

    if (Test-Path $userBunExe) {
        $bunBin = $userBunExe
    }

    # Method 2: Official raw script from GitHub
    if (-not $bunBin) {
        try {
            Invoke-RestMethod -Uri "https://raw.githubusercontent.com/oven-sh/bun/main/src/cli/install.ps1" -UseBasicParsing | Invoke-Expression
        } catch {
            Write-Warn "Установка через GitHub raw script не удалась. Скачиваю бинарник напрямую..."
        }
    }

    if (Test-Path $userBunExe) {
        $bunBin = $userBunExe
    }

    # Method 3: Direct binary download of bun-windows-x64.zip from GitHub Releases
    if (-not $bunBin) {
        Write-Step "Загружаю bun-windows-x64.zip напрямую из GitHub Releases..."
        try {
            $tempZip = Join-Path ([System.IO.Path]::GetTempPath()) "bun-windows-x64.zip"
            $tempExt = Join-Path ([System.IO.Path]::GetTempPath()) ("bun-ext-" + [System.Guid]::NewGuid().ToString().Substring(0,8))
            $directZipUrl = "https://github.com/oven-sh/bun/releases/latest/download/bun-windows-x64.zip"

            Invoke-WebRequest -Uri $directZipUrl -OutFile $tempZip -UseBasicParsing
            Expand-Archive -Path $tempZip -DestinationPath $tempExt -Force

            $foundExe = Get-ChildItem -Path $tempExt -Filter "bun.exe" -Recurse | Select-Object -First 1
            if ($foundExe) {
                if (-not (Test-Path $userBunDir)) {
                    New-Item -ItemType Directory -Path $userBunDir -Force | Out-Null
                }
                Copy-Item -Path $foundExe.FullName -Destination $userBunExe -Force
                $bunBin = $userBunExe
            }

            Remove-Item -Path $tempZip -Force -ErrorAction SilentlyContinue
            Remove-Item -Path $tempExt -Recurse -Force -ErrorAction SilentlyContinue
        } catch {
            Write-Warn "Прямая загрузка архива завершилась с ошибкой: $($_.Exception.Message)"
        }
    }

    # Method 4: winget fallback
    if (-not $bunBin -and (Get-Command winget -ErrorAction SilentlyContinue)) {
        Write-Step "Пробую установку через winget..."
        try {
            & winget install Oven-sh.Bun --accept-source-agreements --accept-package-agreements
            if (Test-Path $userBunExe) {
                $bunBin = $userBunExe
            } elseif (Get-Command bun -ErrorAction SilentlyContinue) {
                $bunBin = (Get-Command bun -ErrorAction SilentlyContinue).Source
            }
        } catch {
            # pass
        }
    }

    # Verify installation
    if ($bunBin -and (Test-Path $bunBin)) {
        $env:PATH = "$userBunDir;$env:PATH"
        $ver = & $bunBin --version 2>$null
        Write-Success "Bun успешно установлен: v$ver"
    } else {
        Write-Err "Критическая ошибка: Не удалось установить Bun автоматически."
        Write-Err "Установите Bun вручную: https://bun.sh или через 'winget install Oven-sh.Bun', после чего повторите запуск инсталлера."
        exit 1
    }
} else {
    $env:PATH = "$userBunDir;$env:PATH"
    $ver = & $bunBin --version 2>$null
    Write-Success "Bun найден: v$ver"
}

# 2. Download or update Klodex repository
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}

# Git мог быть установлен (или добавлен в PATH) уже после старта этой сессии:
# перечитываем PATH из реестра, иначе Get-Command git его не увидит.
$machinePath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::Machine)
$freshUserPath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::User)
if ($machinePath -or $freshUserPath) {
    $env:PATH = "$machinePath;$freshUserPath;$env:PATH"
}

$gitExe = $null
$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if ($gitCmd) {
    $gitExe = $gitCmd.Source
}
if (-not $gitExe) {
    # Стандартные пути Git for Windows (если галка "Add to PATH" не была включена)
    foreach ($candidate in @(
        "$env:ProgramFiles\Git\cmd\git.exe",
        "$env:ProgramFiles\Git\bin\git.exe",
        "${env:ProgramFiles(x86)}\Git\cmd\git.exe",
        "$env:LOCALAPPDATA\Programs\Git\cmd\git.exe",
        "$env:LOCALAPPDATA\Git\cmd\git.exe",
        "$env:USERPROFILE\scoop\shims\git.exe"
    )) {
        if ($candidate -and (Test-Path $candidate)) {
            $gitExe = $candidate
            $env:PATH = "$(Split-Path $candidate);$env:PATH"
            Write-Warn "Git найден вне PATH: $candidate"
            break
        }
    }
}

if ($gitExe) {
    if (Test-Path "$InstallDir\.git") {
        Write-Step "Обновляю Klodex через Git..."
        & $gitExe -C $InstallDir fetch --depth=1 origin main
        & $gitExe -C $InstallDir reset --hard origin/main
    } else {
        Write-Step "Клонирую репозиторий через Git..."
        Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue
        & $gitExe clone --depth=1 $RepoUrl $InstallDir
    }
} else {
    Write-Step "Git не найден. Загружаю ZIP-архив проекта..."
    Write-Warn "Для обновлений через Git: winget install Git.Git, затем откройте новое окно терминала."
    $tempZip = Join-Path ([System.IO.Path]::GetTempPath()) "klodex-src.zip"
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
    & $bunBin install
    Push-Location "$InstallDir\web-ui"
    try {
        & $bunBin install
    } finally {
        Pop-Location
    }
    Write-Step "Компилирую веб-интерфейс..."
    & $bunBin run build
} finally {
    Pop-Location
}

# 4. Create launcher scripts in bin
if (-not (Test-Path $BinDir)) {
    New-Item -ItemType Directory -Path $BinDir -Force | Out-Null
}

# Clean up legacy .ps1 launcher so PowerShell doesn't hit ExecutionPolicy restrictions
if (Test-Path "$BinDir\klodex.ps1") {
    Remove-Item -Path "$BinDir\klodex.ps1" -Force -ErrorAction SilentlyContinue
}

# Windows CMD / PowerShell launcher (works in both CMD and PowerShell without ExecutionPolicy blocks)
$cmdContent = @"
@echo off
if exist "%USERPROFILE%\.bun\bin\bun.exe" (
    "%USERPROFILE%\.bun\bin\bun.exe" run --cwd "$InstallDir" start %*
) else (
    bun run --cwd "$InstallDir" start %*
)
"@
Set-Content -Path "$BinDir\klodex.cmd" -Value $cmdContent -Encoding ASCII
Set-Content -Path "$BinDir\klodex.bat" -Value $cmdContent -Encoding ASCII

# Git Bash / MSYS2 wrapper
$shContent = @"
#!/usr/bin/env bash
BUN_EXE="`$USERPROFILE/.bun/bin/bun.exe"
if [ -f "`$BUN_EXE" ]; then
    exec "`$BUN_EXE" run --cwd "$InstallDir" start "`$@"
else
    exec bun run --cwd "$InstallDir" start "`$@"
fi
"@
Set-Content -Path "$BinDir\klodex" -Value $shContent -Encoding ASCII

# Also set ExecutionPolicy for CurrentUser to RemoteSigned if possible
try {
    $policy = Get-ExecutionPolicy -Scope CurrentUser
    if ($policy -eq "Restricted" -or $policy -eq "Undefined") {
        Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force -ErrorAction SilentlyContinue
    }
} catch {}

Write-Success "Лаунчер создан: $BinDir\klodex.cmd"

# 5. Add bin directories to user PATH permanently
$userPath = [Environment]::GetEnvironmentVariable("Path", [EnvironmentVariableTarget]::User)
if ($userPath -notlike "*$userBunDir*") {
    $userPath = "$userBunDir;$userPath"
    [Environment]::SetEnvironmentVariable("Path", $userPath, [EnvironmentVariableTarget]::User)
}
if ($userPath -notlike "*$BinDir*") {
    $userPath = "$BinDir;$userPath"
    [Environment]::SetEnvironmentVariable("Path", $userPath, [EnvironmentVariableTarget]::User)
}
$env:PATH = "$userBunDir;$BinDir;$env:PATH"
Write-Success "Папки Bun и Klodex добавлены в переменную PATH пользователя."

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
Write-Host "  Если команда 'klodex' не распознается в текущем окне, откройте новое окно PowerShell.`n" -ForegroundColor DarkGray

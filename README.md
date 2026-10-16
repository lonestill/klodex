# klodex

Локальный веб-агент для кодинга в браузере с прямым доступом к файловой системе, терминалу и каталогу моделей.

## Установка

### macOS / Linux
```bash
curl -fsSL https://raw.githubusercontent.com/lonestill/klodex/main/install.sh | bash
```

### Windows (PowerShell)
```powershell
irm https://raw.githubusercontent.com/lonestill/klodex/main/install.ps1 | iex
```

### Вручную
Требуется [Bun](https://bun.sh).
```bash
git clone https://github.com/lonestill/klodex.git ~/.klodex
cd ~/.klodex
bun install
bun run build
bun link
```

## Использование

```bash
klodex                 # запуск сервера в текущей директории
klodex --open          # запуск с автоматическим открытием браузера
klodex -p 4646         # выбор порта (дефолт: 4545 или $KLODEX_PORT)
```

## Конфигурация

Файл: `~/.config/klodex/config.jsonc`

```jsonc
{
  "port": 4545,
  "defaultProvider": "opencode",
  "defaultModel": "deepseek-v4.1-flash-free",
  "maxSteps": 64,
  "maxSubagentSteps": 32,
  "systemPrompt": "Пиши строгий TypeScript без комментариев к очевидному коду.",
  "auth": {
    "anthropic": "sk-ant-...",
    "openai": "sk-..."
  },
  "subagentModels": {
    "explore": "opencode/deepseek-v4.1-flash-free",
    "general": "anthropic/claude-5.5-sonnet"
  },
  "firstRunCompleted": true,
  "updateRepo": "lonestill/klodex"
}
```

## Структура

```
bin/          — CLI-лаунчер
src/
  index.ts    — точка входа и парсинг CLI-флагов
  server.ts   — HTTP/SSE сервер (Bun.serve) и раздача фронтенда
  agent.ts    — цикл агента и субагентов (Vercel AI SDK v7)
  tools.ts    — инструменты: bash, read, write, edit, glob, grep
  providers.ts— каталог моделей (models.dev + локальные + free/keyless)
  updater.ts  — автообновление (git pull или tarball fallback)
  config.ts   — загрузка и запись JSONC-конфига
web-ui/       — интерфейс (React 19, Vite, Tailwind v4, shadcn)
install.sh    — установщик для macOS и Linux
install.ps1   — установщик для Windows
```

## Лицензия

MIT

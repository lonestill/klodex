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

## Рабочая область

Кнопка **«Рабочая область»** в чате открывает четыре вкладки:

- **Изменения** — контрольные точки до/после задачи, список файлов, общий diff, результаты shell-команд, откат файла или итерации и создание коммита. Учитываются изменения через `write`, `edit` и shell. Требуется Git; отслеживаемые и неигнорируемые новые файлы сохраняются через отдельный индекс и `refs/klodex/*`.
- **Preview** — запуск/остановка dev-сервера, локальная страница рядом с чатом, логи, desktop/mobile-снимки и ошибки консоли. Для снимка отдельного элемента укажи CSS-селектор. Кнопка **«В чат»** прикладывает изображение, DOM-фрагмент и ошибки к следующему сообщению; для анализа изображения выбери модель с поддержкой vision.
- **Память** — редактируемые заметки проекта и поиск по полной истории. `/compact` создаёт смысловое резюме для модели, сохраняя исходную переписку. Автоматическое сжатие использует тот же механизм.
- **Задачи** — постоянная очередь, статусы запусков и продолжение прерванных задач. После перезапуска активный запуск отмечается `interrupted`; **«Продолжить»** создаёт новый запуск с журналом уже выполненных операций. Это продолжение с проверкой текущего состояния, а не повтор команды с последней строки.

Откат возвращает состояние **до конкретной задачи**, включая существовавшие пользовательские правки. Более поздние изменения в затронутом файле вызывают конфликт. Коммит из панели отклоняется, если затронутые файлы содержат правки вне выбранной задачи или уже находятся в staging.

Swarm работает в отдельных Git worktree. `dependsOn` задаёт зависимости задач; успешные результаты переносятся в основной проект после проверки конфликтов. Конфликтующие результаты остаются в worktree для ручного разбора. Роль `explore` получает инструменты чтения без shell и записи. Worktree изолирует рабочие файлы, но не является sandbox для shell. Зависимости и игнорируемые файлы окружения в него автоматически не копируются.

Для браузерных снимков установи Chromium (также поддерживается установленный Google Chrome):

```bash
bun run browser:install
```

Журнал запусков хранится в `runs.db` рядом с `klodex.db`; worktree, журналы swarm и снимки — в `worktrees/`, `swarms/`, `screenshots/` каталога данных Klodex. Запуски одного Git-проекта выполняются последовательно. Очередь сохраняется при перезапуске; dev-сервер нужно запустить заново.

## Проверки разработки

```bash
bun test
bunx tsc --noEmit
bun run build
KLODEX_BROWSER_TEST=1 bun test  # дополнительно реальные desktop/mobile-снимки
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
  skills.ts   — система скиллов, парсинг frontmatter и каталог расширений
  updater.ts  — автообновление (git pull или tarball fallback)
  config.ts   — загрузка и запись JSONC-конфига
web-ui/       — интерфейс (React 19, Vite, Tailwind v4, shadcn)
install.sh    — установщик для macOS и Linux
install.ps1   — установщик для Windows
```

## Каталог Скиллов и Промптов

Klodex поддерживает расширение возможностей через подключаемые скиллы и шаблоны:
- Открытый репозиторий каталога: [lonestill/klodex-skills](https://github.com/lonestill/klodex-skills)
- Полный гайд по созданию и публикации: [Гайд по добавлению скиллов и промптов](https://github.com/lonestill/klodex-skills#readme)
- Локальная разработка: скиллы можно класть в `.klodex/skills/` и `.klodex/prompts/` в рабочей директории проекта.

## Лицензия

MIT

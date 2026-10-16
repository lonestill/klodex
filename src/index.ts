import { spawn } from "node:child_process";
import { loadConfig } from "./config.ts";
import { serve } from "./server.ts";

const VERSION = "0.1.0";

function printHelp() {
  console.log(`
klodex v${VERSION} — автономный кодинг-агент

Использование:
  klodex [опции]

Опции:
  -p, --port <port>    Порт сервера (по умолчанию: 4545 или KLODEX_PORT)
  -o, --open           Автоматически открыть браузер при старте
      --no-open        Не открывать браузер
  -v, --version        Показать версию
  -h, --help           Справка по командам
`);
}

function openBrowser(url: string) {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      spawn("open", [url], { detached: true, stdio: "ignore" });
    } else if (platform === "win32") {
      spawn("cmd", ["/c", "start", url], { detached: true, stdio: "ignore" });
    } else {
      spawn("xdg-open", [url], { detached: true, stdio: "ignore" });
    }
  } catch {
    // Ignore browser open errors
  }
}

const args = process.argv.slice(2);
const cfg = loadConfig();

let port = Number(process.env.KLODEX_PORT ?? cfg.port ?? 4545);
let shouldOpen = false;

for (let i = 0; i < args.length; i++) {
  const arg = args[i];
  if (arg === "-h" || arg === "--help") {
    printHelp();
    process.exit(0);
  }
  if (arg === "-v" || arg === "--version") {
    console.log(`klodex v${VERSION}`);
    process.exit(0);
  }
  if (arg === "-p" || arg === "--port") {
    const next = args[++i];
    if (next && !Number.isNaN(Number(next))) {
      port = Number(next);
    }
  }
  if (arg === "-o" || arg === "--open") {
    shouldOpen = true;
  }
  if (arg === "--no-open") {
    shouldOpen = false;
  }
}

serve(port);

const url = `http://127.0.0.1:${port}`;
console.log(`\n  \x1b[1m\x1b[37mklodex\x1b[0m v${VERSION}`);
console.log(`  \x1b[32m➜\x1b[0m  Сервер:      \x1b[36m${url}\x1b[0m`);
console.log(`  \x1b[32m➜\x1b[0m  Проект:      \x1b[90m${process.cwd()}\x1b[0m`);
console.log(`  \x1b[90mНажмите Ctrl+C для остановки\x1b[0m\n`);

if (shouldOpen) {
  openBrowser(url);
}

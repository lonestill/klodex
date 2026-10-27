import { spawn, type ChildProcess } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "./config.ts";
import { resolveShellCommand } from "./tools.ts";

interface PreviewProcess {
  process: ChildProcess;
  command: string;
  url: string;
  logs: string;
  startedAt: number;
  exitCode: number | null;
}
const processes = new Map<string, PreviewProcess>();
export function localUrl(value: string) {
  const url = new URL(value);
  if (
    !["http:", "https:"].includes(url.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) ||
    url.username ||
    url.password
  )
    throw new Error("Preview requires a localhost HTTP URL");
  return url.href;
}
export function previewState(sessionId: string) {
  const state = processes.get(sessionId);
  return state
    ? {
        running:
          state.exitCode === null &&
          state.process.exitCode === null &&
          !state.process.killed,
        command: state.command,
        url: state.url,
        logs: state.logs,
        startedAt: state.startedAt,
        exitCode: state.exitCode,
      }
    : { running: false, logs: "", url: "", command: "" };
}
export function stopPreview(sessionId: string) {
  const state = processes.get(sessionId);
  if (state?.process.pid) {
    try {
      if (process.platform === "win32")
        spawn("taskkill", ["/PID", String(state.process.pid), "/T", "/F"]);
      else process.kill(-state.process.pid, "SIGTERM");
    } catch {
      state.process.kill();
    }
  }
  return previewState(sessionId);
}
export function startPreview(
  sessionId: string,
  projectDir: string,
  command: string,
  url: string,
) {
  if (previewState(sessionId).running)
    throw new Error("Stop the existing preview before starting another");
  if (!command.trim()) throw new Error("A dev-server command is required");
  const href = localUrl(url);
  const { cmd } = resolveShellCommand(command);
  const proc = spawn(cmd[0]!, cmd.slice(1), {
    cwd: projectDir,
    env: process.env,
    detached: process.platform !== "win32",
    stdio: ["ignore", "pipe", "pipe"],
  });
  const state: PreviewProcess = {
    process: proc,
    command,
    url: href,
    logs: "",
    startedAt: Date.now(),
    exitCode: null,
  };
  processes.set(sessionId, state);
  const append = (data: Buffer | string) => {
    state.logs = (state.logs + data.toString()).slice(-60000);
  };
  proc.stdout?.on("data", append);
  proc.stderr?.on("data", append);
  proc.on("error", (error) => {
    append(error.message);
    state.exitCode = -1;
  });
  proc.on("exit", (code) => {
    state.exitCode = code ?? -1;
  });
  return previewState(sessionId);
}
export function previewScripts(projectDir: string) {
  try {
    return (
      JSON.parse(readFileSync(join(projectDir, "package.json"), "utf8"))
        .scripts ?? {}
    );
  } catch {
    return {};
  }
}
process.once("exit", () => {
  for (const id of processes.keys()) stopPreview(id);
});

export async function capturePreview(
  url: string,
  mobile = false,
  selector?: string,
) {
  const href = localUrl(url);
  const { chromium } = await import("playwright");
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    browser = await chromium.launch({ channel: "chrome", headless: true });
  }
  try {
    const page = await browser.newPage({
      viewport: mobile
        ? { width: 390, height: 844 }
        : { width: 1440, height: 900 },
      deviceScaleFactor: 1,
    });
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    const response = await page.goto(href, {
      waitUntil: "domcontentloaded",
      timeout: 20000,
    });
    if (response && !response.ok())
      errors.push(`HTTP ${response.status()} ${response.url()}`);
    await page
      .waitForLoadState("networkidle", { timeout: 3000 })
      .catch(() => {});
    const id = crypto.randomUUID();
    const directory = join(paths.dataDir, "screenshots");
    mkdirSync(directory, { recursive: true });
    const element = selector?.trim()
      ? page.locator(selector).first()
      : undefined;
    const context = element
      ? await element.evaluate((node) => node.outerHTML.slice(0, 12000))
      : undefined;
    if (element)
      await element.screenshot({
        path: join(directory, `${id}.png`),
        animations: "disabled",
        timeout: 10000,
      });
    else
      await page.screenshot({
        path: join(directory, `${id}.png`),
        fullPage: true,
        animations: "disabled",
      });
    const result = {
      id,
      url: `/api/screenshots/${id}`,
      viewport: mobile ? "mobile" : "desktop",
      errors,
      title: await page.title(),
      selector,
      context,
    };
    writeFileSync(join(directory, `${id}.json`), JSON.stringify(result));
    return result;
  } finally {
    await browser.close();
  }
}
export function screenshotPath(id: string) {
  if (!/^[a-f0-9-]{36}$/.test(id)) throw new Error("Invalid screenshot ID");
  const file = join(paths.dataDir, "screenshots", `${id}.png`);
  if (!existsSync(file)) throw new Error("Screenshot not found");
  return file;
}
export function screenshotContext(id: string) {
  const file = screenshotPath(id).replace(/\.png$/, ".json");
  return existsSync(file) ? readFileSync(file, "utf8") : "";
}

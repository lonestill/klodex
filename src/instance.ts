import { execSync, spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { paths } from "./config.ts";

const PID_FILE = join(paths.configDir, "klodex.pid");

function sleepSync(ms: number): void {
  if (ms <= 0) return;
  try {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  } catch {
    const start = Date.now();
    while (Date.now() - start < ms) {}
  }
}

export function isPidAlive(pid: number): boolean {
  if (pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Checks whether a command line belongs to a Klodex server process.
 * Explicitly excludes shells, editors, git, grep, electron, etc.
 */
export function isKlodexCommand(cmd: string): boolean {
  if (!cmd) return false;

  // Exclude tools, editors, and shells that might have 'klodex' in their arguments
  if (
    /(?:grep|ps\s+-|diff|git\s+|bash|zsh|sh\s+|cat\s+|echo\s+|nano\s+|vim\s+|code\s+|cursor\s+|electron\s+|antigravity)/i.test(
      cmd
    )
  ) {
    return false;
  }

  // 1. Standalone Klodex binary or macOS bundle
  if (/(?:^|\/|\s)(?:klodex|Klodex\.app\/Contents\/MacOS\/klodex)(?:\s|$)/i.test(cmd)) {
    return true;
  }

  // 2. Bun or Node running Klodex entrypoint
  if (/(?:bun|node)(?:\.exe)?\s+.*(?:klodex|src\/index\.ts|index\.ts)/i.test(cmd)) {
    return true;
  }

  return false;
}

export function terminatePid(pid: number, force = false): boolean {
  if (pid <= 0 || pid === process.pid || pid === process.ppid) return false;
  try {
    if (process.platform === "win32") {
      execSync(`taskkill /F /PID ${pid}`, { stdio: "ignore" });
      return true;
    }

    if (force) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
      return true;
    }

    // Attempt graceful SIGTERM first
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return false;
    }

    // Wait up to 300ms for process to exit
    const start = Date.now();
    while (Date.now() - start < 300) {
      if (!isPidAlive(pid)) return true;
      sleepSync(25);
    }

    // Still alive after 300ms, force SIGKILL
    if (isPidAlive(pid)) {
      try {
        process.kill(pid, "SIGKILL");
      } catch {}
      sleepSync(50);
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Returns PIDs listening on the specified TCP port.
 */
export function getPidsListeningOnPort(port: number): number[] {
  const pids: number[] = [];
  try {
    if (process.platform === "win32") {
      const out = execSync(`netstat -ano | findstr :${port}`, { encoding: "utf8" });
      for (const line of out.trim().split("\n")) {
        if (/LISTENING/i.test(line)) {
          const parts = line.trim().split(/\s+/);
          const pid = Number(parts[parts.length - 1]);
          if (pid && !pids.includes(pid)) pids.push(pid);
        }
      }
    } else {
      const out = execSync(`lsof -ti :${port} -sTCP:LISTEN`, { encoding: "utf8" });
      for (const s of out.trim().split("\n")) {
        const pid = Number(s.trim());
        if (pid && !pids.includes(pid)) pids.push(pid);
      }
    }
  } catch {}
  return pids;
}

/**
 * Waits until the given port is completely free.
 */
export function waitForPortFree(port: number, maxWaitMs = 1500): boolean {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const pids = getPidsListeningOnPort(port);
    if (pids.length === 0 || (pids.length === 1 && pids[0] === process.pid)) {
      return true;
    }
    sleepSync(50);
  }
  return false;
}

function getAncestorPids(): Set<number> {
  const ancestors = new Set<number>();
  ancestors.add(process.pid);
  let current = process.ppid;
  while (current > 1) {
    ancestors.add(current);
    try {
      if (process.platform !== "win32") {
        const ppidStr = execSync(`ps -p ${current} -o ppid=`, { encoding: "utf8" }).trim();
        const next = Number(ppidStr);
        if (!next || next === current || ancestors.has(next)) break;
        current = next;
      } else {
        break;
      }
    } catch {
      break;
    }
  }
  return ancestors;
}

/**
 * Scans the process table and finds any other running Klodex processes.
 */
export function findOtherKlodexPids(excludePid = process.pid, targetPort = 4545): number[] {
  const found = new Set<number>();
  const ancestors = getAncestorPids();
  if (excludePid) ancestors.add(excludePid);

  // 1. PID file
  try {
    if (existsSync(PID_FILE)) {
      const saved = Number(readFileSync(PID_FILE, "utf8").trim());
      if (saved && !ancestors.has(saved) && isPidAlive(saved)) {
        found.add(saved);
      }
    }
  } catch {}

  // 2. Listening port
  const portPids = getPidsListeningOnPort(targetPort);
  for (const pid of portPids) {
    if (!ancestors.has(pid) && isPidAlive(pid)) {
      found.add(pid);
    }
  }

  // 3. Process table scan
  try {
    if (process.platform !== "win32") {
      const psOutput = execSync("ps -eo pid,command", { encoding: "utf8" });
      for (const line of psOutput.trim().split("\n")) {
        const trimmed = line.trim();
        const match = trimmed.match(/^(\d+)\s+(.+)$/);
        if (!match) continue;
        const pid = Number(match[1]);
        const cmd = match[2];
        if (ancestors.has(pid) || pid <= 0) continue;

        if (isKlodexCommand(cmd) && isPidAlive(pid)) {
          found.add(pid);
        }
      }
    }
  } catch {}

  return Array.from(found);
}

/**
 * Terminates all other Klodex processes across the entire system
 * and waits until targetPort is released.
 */
export function terminateAllOtherKlodexInstances(excludePid = process.pid, targetPort = 4545): number[] {
  const pids = findOtherKlodexPids(excludePid, targetPort);
  const terminated: number[] = [];

  for (const pid of pids) {
    if (terminatePid(pid)) {
      terminated.push(pid);
      console.log(`  \x1b[33m[!] Завершён фоновый процесс Klodex (PID ${pid})…\x1b[0m`);
    }
  }

  // Wait for socket to clear
  waitForPortFree(targetPort, 1200);

  return terminated;
}

/**
 * Enforces single-instance execution at startup:
 * Terminates any existing Klodex instances, claims PID lock, registers exit hooks.
 */
export function acquireSingleInstance(port = 4545): void {
  const currentPid = process.pid;

  terminateAllOtherKlodexInstances(currentPid, port);

  // Write current PID to lockfile
  try {
    mkdirSync(paths.configDir, { recursive: true });
    writeFileSync(PID_FILE, String(currentPid));
  } catch {}

  // Cleanup PID lockfile on process exit
  const cleanup = () => {
    try {
      if (existsSync(PID_FILE)) {
        const saved = Number(readFileSync(PID_FILE, "utf8").trim());
        if (saved === currentPid) {
          unlinkSync(PID_FILE);
        }
      }
    } catch {}
  };

  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(0);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(0);
  });
}

/**
 * Fully restarts Klodex:
 * 1. Stops the listening HTTP server socket.
 * 2. Kills any other lingering Klodex processes across the system.
 * 3. Spawns the updated Klodex process detached in background.
 * 4. Exits the current process so the new instance immediately takes over the port.
 */
export function restartServer(server?: { stop?: (closeActive?: boolean) => void }, port = 4545): void {
  try {
    if (server && typeof server.stop === "function") {
      server.stop(true);
    }
  } catch {}

  try {
    terminateAllOtherKlodexInstances(process.pid, port);
  } catch {}

  try {
    const child = spawn(process.argv[0], process.argv.slice(1), {
      cwd: process.cwd(),
      detached: true,
      stdio: "ignore",
      env: process.env,
    });
    child.unref();
  } catch (err) {
    console.error("[server] Failed to spawn restarted process:", err);
  }

  process.exit(0);
}

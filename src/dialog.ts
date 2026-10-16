import { spawn } from "node:child_process";

/**
 * Opens a native OS folder picker dialog:
 * - macOS: osascript (choose folder)
 * - Windows: PowerShell System.Windows.Forms.FolderBrowserDialog
 * - Linux: zenity --file-selection --directory or kdialog --getexistingdirectory
 */
export async function pickNativeFolder(title = "Выбери папку проекта"): Promise<string | null> {
  const platform = process.platform;

  if (platform === "darwin") {
    return new Promise((resolve) => {
      const proc = spawn("osascript", [
        "-e",
        'tell application "System Events" to activate',
        "-e",
        `tell application "System Events" to return POSIX path of (choose folder with prompt "${title.replace(/"/g, '\\"')}")`,
      ]);
      let out = "";
      proc.stdout.on("data", (d) => {
        out += d.toString();
      });
      proc.on("close", (code) => {
        const cleaned = out.trim();
        // Remove trailing slash if present
        resolve(code === 0 && cleaned ? cleaned.replace(/\/+$/, "") : null);
      });
      proc.on("error", () => resolve(null));
    });
  }

  if (platform === "win32") {
    return new Promise((resolve) => {
      const script = `
Add-Type -AssemblyName System.Windows.Forms
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = '${title.replace(/'/g, "''")}'
$f.ShowNewFolderButton = $true
if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $f.SelectedPath
}
`;
      const proc = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", script]);
      let out = "";
      proc.stdout.on("data", (d) => {
        out += d.toString();
      });
      proc.on("close", (code) => {
        const cleaned = out.trim();
        resolve(code === 0 && cleaned ? cleaned : null);
      });
      proc.on("error", () => resolve(null));
    });
  }

  // Linux: try zenity, fallback to kdialog
  return new Promise((resolve) => {
    const proc = spawn("zenity", [
      "--file-selection",
      "--directory",
      `--title=${title}`,
    ]);
    let out = "";
    proc.stdout.on("data", (d) => {
      out += d.toString();
    });
    proc.on("close", (code) => {
      if (code === 0 && out.trim()) {
        resolve(out.trim().replace(/\/+$/, ""));
      } else {
        // Fallback to kdialog
        const kproc = spawn("kdialog", [
          "--getexistingdirectory",
          ".",
          "--title",
          title,
        ]);
        let kout = "";
        kproc.stdout.on("data", (d) => {
          kout += d.toString();
        });
        kproc.on("close", (kcode) => {
          if (kcode === 0 && kout.trim()) {
            resolve(kout.trim().replace(/\/+$/, ""));
          } else {
            resolve(null);
          }
        });
        kproc.on("error", () => resolve(null));
      }
    });
    proc.on("error", () => resolve(null));
  });
}

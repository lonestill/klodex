import { spawn } from "node:child_process";

export interface PickFolderResult {
  path: string | null;
  cancelled: boolean;
}

/**
 * Opens a native OS folder picker dialog:
 * - macOS: osascript with Finder activate + choose folder
 * - Windows: PowerShell System.Windows.Forms.FolderBrowserDialog with TopMost owner
 * - Linux: zenity -> kdialog -> python3 tkinter
 */
export async function pickNativeFolder(title = "Выбери папку проекта"): Promise<PickFolderResult> {
  const platform = process.platform;

  if (platform === "darwin") {
    return new Promise((resolve) => {
      const escapedTitle = title.replace(/"/g, '\\"');
      const script = `
tell application "Finder"
  activate
  try
    set f to choose folder with prompt "${escapedTitle}"
    return "OK:" & POSIX path of f
  on error errMsg number errNum
    if errNum is -128 then
      return "CANCEL"
    else
      return "ERROR:" & errMsg
    end if
  end try
end tell
`;
      const proc = spawn("osascript", ["-e", script]);
      let out = "";
      proc.stdout.on("data", (d) => {
        out += d.toString();
      });
      proc.on("close", (code) => {
        const text = out.trim();
        if (code === 0 && text.startsWith("OK:")) {
          const p = text.slice(3).trim().replace(/\/+$/, "");
          resolve({ path: p || null, cancelled: false });
        } else if (text === "CANCEL") {
          resolve({ path: null, cancelled: true });
        } else {
          resolve({ path: null, cancelled: false });
        }
      });
      proc.on("error", () => resolve({ path: null, cancelled: false }));
    });
  }

  if (platform === "win32") {
    return new Promise((resolve) => {
      const escapedTitle = title.replace(/'/g, "''");
      const script = `
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = '${escapedTitle}'
$f.ShowNewFolderButton = $true
$res = $f.ShowDialog($form)
if ($res -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output "OK:$($f.SelectedPath)"
} else {
    Write-Output "CANCEL"
}
`;
      const proc = spawn("powershell.exe", [
        "-NoProfile",
        "-NonInteractive",
        "-Sta",
        "-ExecutionPolicy",
        "Bypass",
        "-Command",
        script,
      ]);
      let out = "";
      proc.stdout.on("data", (d) => {
        out += d.toString();
      });
      proc.on("close", (code) => {
        const text = out.trim();
        if (code === 0 && text.startsWith("OK:")) {
          const p = text.slice(3).trim();
          resolve({ path: p || null, cancelled: false });
        } else if (text.includes("CANCEL")) {
          resolve({ path: null, cancelled: true });
        } else {
          resolve({ path: null, cancelled: false });
        }
      });
      proc.on("error", () => resolve({ path: null, cancelled: false }));
    });
  }

  // Linux: try zenity, fallback to kdialog, fallback to python3 tkinter
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
        resolve({ path: out.trim().replace(/\/+$/, ""), cancelled: false });
      } else if (code === 1) {
        // User cancelled in zenity
        resolve({ path: null, cancelled: true });
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
            resolve({ path: kout.trim().replace(/\/+$/, ""), cancelled: false });
          } else if (kcode === 1) {
            resolve({ path: null, cancelled: true });
          } else {
            // Fallback to python3 tkinter
            const pyproc = spawn("python3", [
              "-c",
              `import tkinter.filedialog as f, sys; d = f.askdirectory(title='${title.replace(/'/g, "\\'")}'); sys.stdout.write(d if d else '')`,
            ]);
            let pyout = "";
            pyproc.stdout.on("data", (d) => {
              pyout += d.toString();
            });
            pyproc.on("close", (pycode) => {
              const res = pyout.trim();
              if (pycode === 0 && res) {
                resolve({ path: res.replace(/\/+$/, ""), cancelled: false });
              } else {
                resolve({ path: null, cancelled: pycode === 0 });
              }
            });
            pyproc.on("error", () => resolve({ path: null, cancelled: false }));
          }
        });
        kproc.on("error", () => resolve({ path: null, cancelled: false }));
      }
    });
    proc.on("error", () => resolve({ path: null, cancelled: false }));
  });
}

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
      const script = `try\nset f to choose folder with prompt "${title.replace(/"/g, '\\"')}"\nreturn POSIX path of f\non error number -128\nreturn ""\nend try`;
      const proc = spawn("osascript", ["-e", script]);
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
[Console]::OutputEncoding = [System.Text.UTF8Encoding]::new($false)
Add-Type -AssemblyName System.Windows.Forms
$form = New-Object System.Windows.Forms.Form
$form.TopMost = $true
$f = New-Object System.Windows.Forms.FolderBrowserDialog
$f.Description = '${title.replace(/'/g, "''")}'
$f.ShowNewFolderButton = $true
if ($f.ShowDialog($form) -eq [System.Windows.Forms.DialogResult]::OK) {
    Write-Output $f.SelectedPath
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
        const cleaned = out.trim();
        resolve(code === 0 && cleaned ? cleaned : null);
      });
      proc.on("error", () => resolve(null));
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
              resolve(pycode === 0 && pyout.trim() ? pyout.trim().replace(/\/+$/, "") : null);
            });
            pyproc.on("error", () => resolve(null));
          }
        });
        kproc.on("error", () => resolve(null));
      }
    });
    proc.on("error", () => resolve(null));
  });
}

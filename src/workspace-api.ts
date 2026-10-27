import {
  getSession,
  getProjectMemory,
  saveProjectMemory,
  getMessages,
} from "./store.ts";
import { listRuns, getRun, newRun, runEvents, saveRun } from "./runs.ts";
import {
  changes,
  diff,
  snapshot,
  applySnapshot,
  git,
  repository,
} from "./workspace.ts";
import {
  startPreview,
  stopPreview,
  previewState,
  previewScripts,
  capturePreview,
  screenshotPath,
  localUrl,
} from "./preview.ts";
import { z } from "zod";

const json = (value: unknown, status = 200) => Response.json(value, { status });
export async function workspaceApi(
  req: Request,
  busy: (dir: string) => boolean,
): Promise<Response | null> {
  const url = new URL(req.url);
  if (url.pathname.startsWith("/api/screenshots/")) {
    try {
      return new Response(
        Bun.file(screenshotPath(url.pathname.split("/")[3]!)),
        { headers: { "content-type": "image/png" } },
      );
    } catch {
      return json({ error: "Screenshot not found" }, 404);
    }
  }
  const match = url.pathname.match(/^\/api\/workspace\/([^/]+)\/([^/]+)$/);
  if (!match) return null;
  const session = getSession(match[1]!);
  if (!session) return json({ error: "Session not found" }, 404);
  const action = match[2];
  try {
    if (action === "runs" && req.method === "GET")
      return json(listRuns(session.id));
    if (action === "memory") {
      if (req.method === "PUT")
        saveProjectMemory(
          session.project_dir,
          z.object({ content: z.string().max(30000) }).parse(await req.json())
            .content,
        );
      return json({ content: getProjectMemory(session.project_dir) });
    }
    if (action === "history" && req.method === "GET") {
      const query = (url.searchParams.get("q") ?? "").toLowerCase();
      return json(
        getMessages(session.id).filter((message) =>
          JSON.stringify(message.data).toLowerCase().includes(query),
        ),
      );
    }
    if (action === "queue" && req.method === "POST") {
      const input = z
        .object({
          prompt: z.string().trim().min(1),
          model: z.string().optional(),
        })
        .parse(await req.json());
      if (!input.prompt?.trim()) throw new Error("Task prompt is required");
      return json(
        newRun({
          sessionId: session.id,
          projectDir: session.project_dir,
          prompt: input.prompt,
          model: input.model || `${session.provider}/${session.model}`,
        }),
      );
    }
    if (action === "preview") {
      if (req.method === "POST") {
        const input = z
          .object({ command: z.string().trim().min(1), url: z.string().url() })
          .parse(await req.json());
        return json(
          startPreview(
            session.id,
            session.project_dir,
            input.command,
            input.url,
          ),
        );
      }
      if (req.method === "DELETE") return json(stopPreview(session.id));
      return json({
        ...previewState(session.id),
        scripts: previewScripts(session.project_dir),
      });
    }
    if (action === "capture" && req.method === "POST") {
      const input = z
        .object({
          url: z.string().url(),
          mobile: z.boolean().optional(),
          selector: z.string().optional(),
        })
        .parse(await req.json());
      localUrl(input.url);
      return json(
        await capturePreview(input.url, Boolean(input.mobile), input.selector),
      );
    }
    const runId = url.searchParams.get("runId");
    const run = runId ? getRun(runId) : undefined;
    if (!run || run.sessionId !== session.id)
      return json({ error: "Run not found" }, 404);
    if (action === "events")
      return json(
        runEvents(run.id, Number(url.searchParams.get("after")) || 0),
      );
    if (action === "cancel" && req.method === "POST") {
      if (run.state !== "queued")
        throw new Error("Only queued tasks can be removed here");
      return json(saveRun({ ...run, state: "cancelled" }));
    }
    if (action === "changes") {
      if (!run.before)
        return json({
          files: [],
          patch: "",
          unavailable: "This run has no Git checkpoint.",
        });
      const after = run.after ?? snapshot(run.projectDir, `${run.id}-live`);
      return json({
        files: changes(run.projectDir, run.before, after),
        patch: diff(
          run.projectDir,
          run.before,
          after,
          url.searchParams.get("file") ?? undefined,
        ),
        checks: runEvents(run.id).filter(
          ({ event }) => event.t === "toolres" && event.name === "bash",
        ),
      });
    }
    if (action === "rollback" && req.method === "POST") {
      if (busy(run.projectDir))
        throw new Error("Wait for the project's active task to finish");
      if (!run.before || !run.after)
        throw new Error("A completed checkpoint is required");
      const { file } = z
        .object({ file: z.string().min(1).optional() })
        .parse(await req.json());
      const backup = snapshot(
        run.projectDir,
        `${run.id}-pre-rollback-${Date.now()}`,
      );
      const restored = applySnapshot(
        run.projectDir,
        run.after,
        run.before,
        file ? [file] : undefined,
      );
      return json({ restored, backup });
    }
    if (action === "commit" && req.method === "POST") {
      if (busy(run.projectDir))
        throw new Error("Wait for the project's active task to finish");
      if (!run.before || !run.after)
        throw new Error("A completed checkpoint is required");
      const { message } = z
        .object({ message: z.string().trim().min(1) })
        .parse(await req.json());
      if (!message?.trim()) throw new Error("Commit message required");
      const root = repository(run.projectDir);
      const names = changes(root, run.before, run.after).map(
        (file) => file.path,
      );
      if (!names.length) throw new Error("No task changes to commit");
      // Refuse to include changes that existed before this task or happened later.
      const head = git(root, ["rev-parse", "HEAD"]).toString().trim();
      const current = snapshot(root, `${run.id}-pre-commit`);
      for (const file of names) {
        if (
          git(root, [
            "--literal-pathspecs",
            "diff",
            "--cached",
            "--name-only",
            "--",
            file,
          ]).length
        )
          throw new Error(`Commit ${file} manually: it has staged changes`);
        if (
          diff(root, head, run.before, file) ||
          diff(root, run.after, current, file)
        )
          throw new Error(
            `Commit ${file} manually: it contains changes outside this task`,
          );
      }
      git(root, ["--literal-pathspecs", "add", "--", ...names]);
      git(root, [
        "--literal-pathspecs",
        "commit",
        "--only",
        "-m",
        message,
        "--",
        ...names,
      ]);
      return json({
        commit: git(root, ["rev-parse", "HEAD"]).toString().trim(),
      });
    }
    return json({ error: "Unknown workspace action" }, 404);
  } catch (error) {
    return json(
      { error: error instanceof Error ? error.message : String(error) },
      409,
    );
  }
}

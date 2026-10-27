import { useCallback, useEffect, useState } from "react";
import {
  X,
  RefreshCw,
  Play,
  Square,
  Camera,
  ExternalLink,
  RotateCcw,
  GitCommitHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n";

type Run = {
  id: string;
  prompt: string;
  model: string;
  state: string;
  createdAt: number;
  error?: string;
  before?: string;
  after?: string;
};
type Capture = {
  id: string;
  url: string;
  viewport: string;
  errors: string[];
  title: string;
};
type Changes = {
  files: { path: string; added: number | null; removed: number | null }[];
  patch: string;
  unavailable?: string;
  checks?: { seq: number; event: { output: string; isError: boolean } }[];
};
async function request<T>(
  url: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}
export function WorkspacePanel({
  sessionId,
  model,
  onClose,
  onAttach,
  onRun,
}: {
  sessionId: string;
  model: string;
  onClose: () => void;
  onAttach: (id: string) => void;
  onRun: () => void;
}) {
  const { lang } = useI18n();
  const tr = (ru: string, en: string) => (lang === "ru" ? ru : en);
  const [tab, setTab] = useState("changes");
  const [runs, setRuns] = useState<Run[]>([]);
  const [selected, setSelected] = useState("");
  const [change, setChange] = useState<Changes | null>(null);
  const [file, setFile] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [memory, setMemory] = useState("");
  const [message, setMessage] = useState("");
  const [queue, setQueue] = useState("");
  const [command, setCommand] = useState("bun run dev");
  const [url, setUrl] = useState("http://localhost:3000");
  const [frameUrl, setFrameUrl] = useState("");
  const [selector, setSelector] = useState("");
  const [preview, setPreview] = useState<{
    running: boolean;
    logs: string;
    url?: string;
  }>({ running: false, logs: "" });
  const [captures, setCaptures] = useState<Capture[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const base = `/api/workspace/${sessionId}`;
  const refresh = useCallback(async () => {
    const next = await request<Run[]>(`${base}/runs`);
    setRuns(next);
    setSelected((current) => current || next[0]?.id || "");
  }, [base]);
  const runAction = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void refresh().catch((err) => setError(String(err)));
    void request<{ content: string }>(`${base}/memory`)
      .then((data) => setMemory(data.content))
      .catch((err) => setError(String(err)));
    const timer = setInterval(() => {
      void refresh().catch(() => {});
    }, 2500);
    return () => clearInterval(timer);
  }, [base, refresh]);
  useEffect(() => {
    if (!selected || tab !== "changes") return;
    let cancelled = false;
    setChange(null);
    request<Changes>(
      `${base}/changes?runId=${selected}${file ? `&file=${encodeURIComponent(file)}` : ""}`,
    )
      .then((data) => {
        if (!cancelled) setChange(data);
      })
      .catch((err) => {
        if (!cancelled) setError(String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [
    base,
    selected,
    file,
    tab,
    runs.find((run) => run.id === selected)?.state,
  ]);
  useEffect(() => {
    if (tab !== "preview") return;
    let cancelled = false;
    const load = () =>
      request<{ running: boolean; logs: string; url?: string }>(
        `${base}/preview`,
      ).then((data) => {
        if (!cancelled) setPreview(data);
      });
    void load().catch((err) => setError(String(err)));
    const timer = setInterval(() => {
      void load().catch(() => {});
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [base, tab]);
  const run = runs.find((item) => item.id === selected);
  const projectRunning = runs.some((item) => item.state === "running");
  const inputClass =
    "w-full rounded-md border border-border bg-background px-3 py-2 text-xs";
  return (
    <aside
      className="fixed inset-0 z-40 flex flex-col bg-background md:static md:z-auto md:w-[48%] md:min-w-[380px] md:max-w-[850px] border-l border-border min-h-0"
      aria-label={tr("Рабочая область", "Workspace")}
    >
      <header className="flex items-center justify-between border-b border-border p-3">
        <strong className="text-sm">
          {tr("Рабочая область", "Workspace")}
        </strong>
        <div className="flex gap-1">
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label={tr("Обновить", "Refresh")}
            onClick={() =>
              void runAction(async () => {
                await refresh();
                if (selected)
                  setChange(await request(`${base}/changes?runId=${selected}`));
              })
            }
          >
            <RefreshCw className="size-4" />
          </Button>
          <Button
            size="icon-sm"
            variant="ghost"
            onClick={onClose}
            aria-label={tr("Закрыть", "Close")}
          >
            <X className="size-4" />
          </Button>
        </div>
      </header>
      <nav className="flex border-b border-border overflow-x-auto">
        {[
          ["changes", tr("Изменения", "Changes")],
          ["preview", "Preview"],
          ["memory", tr("Память", "Memory")],
          ["runs", tr("Задачи", "Tasks")],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key!)}
            className={`px-4 py-3 text-xs whitespace-nowrap border-b-2 ${tab === key ? "border-primary text-foreground" : "border-transparent text-muted-foreground"}`}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {error && (
          <div
            role="alert"
            className="rounded border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive"
          >
            {error}
          </div>
        )}
        {message && (
          <p role="status" className="text-xs text-emerald-500">
            {message}
          </p>
        )}
        {tab === "changes" && (
          <>
            <label className="block text-xs space-y-2">
              <span>{tr("Итерация", "Iteration")}</span>
              <select
                className={inputClass}
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setFile("");
                }}
              >
                <option value="">
                  {tr("Выберите задачу", "Select a task")}
                </option>
                {runs.map((item) => (
                  <option key={item.id} value={item.id}>
                    {new Date(item.createdAt).toLocaleTimeString()} ·{" "}
                    {item.state} · {item.prompt.slice(0, 65)}
                  </option>
                ))}
              </select>
            </label>
            {!runs.length && (
              <p className="text-sm text-muted-foreground">
                {tr(
                  "Изменения появятся после первой задачи. Контрольная точка создаётся до запуска агента.",
                  "Changes appear after your first task. A checkpoint is created before the agent starts.",
                )}
              </p>
            )}
            {change?.unavailable && (
              <p className="text-xs text-muted-foreground">
                {change.unavailable}
              </p>
            )}
            {change && (
              <>
                <div className="space-y-1">
                  <button
                    className="text-xs underline"
                    onClick={() => setFile("")}
                  >
                    {tr("Все файлы", "All files")}
                  </button>
                  {change.files.map((item) => (
                    <button
                      key={item.path}
                      className={`flex w-full justify-between gap-3 p-2 rounded text-xs text-left ${file === item.path ? "bg-accent" : "hover:bg-accent/50"}`}
                      onClick={() => setFile(item.path)}
                    >
                      <span className="truncate font-mono">{item.path}</span>
                      <span className="whitespace-nowrap">
                        <span className="text-emerald-500">
                          +{item.added ?? "binary"}
                        </span>{" "}
                        <span className="text-rose-400">
                          −{item.removed ?? "binary"}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      busy ||
                      projectRunning ||
                      !run?.after ||
                      !change.files.length
                    }
                    onClick={() => {
                      if (
                        confirm(
                          tr(
                            "Откатить изменения этой итерации? Более поздние изменения вызовут конфликт.",
                            "Restore this iteration? Later edits will cause a conflict.",
                          ),
                        )
                      )
                        void runAction(async () => {
                          await request(
                            `${base}/rollback?runId=${selected}`,
                            "POST",
                            { file: file || undefined },
                          );
                          setChange(
                            await request(`${base}/changes?runId=${selected}`),
                          );
                          setMessage(
                            tr("Файлы восстановлены", "Files restored"),
                          );
                        });
                    }}
                  >
                    <RotateCcw className="size-3" />
                    {file
                      ? tr("Откатить файл", "Restore file")
                      : tr("Откатить итерацию", "Restore iteration")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={
                      busy ||
                      projectRunning ||
                      !run?.after ||
                      !change.files.length
                    }
                    onClick={() => {
                      const text = prompt(
                        tr("Сообщение коммита", "Commit message"),
                      );
                      if (text)
                        void runAction(async () => {
                          const result = await request<{ commit: string }>(
                            `${base}/commit?runId=${selected}`,
                            "POST",
                            { message: text },
                          );
                          setMessage(`Commit ${result.commit.slice(0, 8)}`);
                        });
                    }}
                  >
                    <GitCommitHorizontal className="size-3" />
                    Commit
                  </Button>
                </div>
                <pre className="overflow-auto rounded border border-border bg-muted/30 p-3 text-[11px] leading-relaxed max-h-[55vh]">
                  {change.patch || tr("Нет изменений", "No changes")}
                </pre>
                <details>
                  <summary className="cursor-pointer text-xs">
                    {tr(
                      "Команды и результаты проверок",
                      "Commands and check results",
                    )}{" "}
                    ({change.checks?.length ?? 0})
                  </summary>
                  {change.checks?.map((check) => (
                    <pre
                      className="text-[11px] whitespace-pre-wrap border-b border-border py-3 max-h-60 overflow-auto"
                      key={check.seq}
                    >
                      {check.event.output}
                    </pre>
                  ))}
                </details>
              </>
            )}
          </>
        )}
        {tab === "preview" && (
          <>
            <label className="block text-xs space-y-2">
              <span>{tr("Команда dev-сервера", "Dev server command")}</span>
              <input
                className={inputClass}
                value={command}
                onChange={(e) => setCommand(e.target.value)}
              />
            </label>
            <label className="block text-xs space-y-2">
              <span>Local URL</span>
              <input
                className={inputClass}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
            </label>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                disabled={busy || preview.running}
                onClick={() =>
                  void runAction(async () => {
                    await request(`${base}/preview`, "POST", { command, url });
                    setFrameUrl(url);
                  })
                }
              >
                <Play className="size-3" />
                {tr("Запустить", "Start")}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!preview.running || busy}
                onClick={() =>
                  void runAction(() => request(`${base}/preview`, "DELETE"))
                }
              >
                <Square className="size-3" />
                Stop
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  try {
                    const parsed = new URL(url);
                    if (
                      !["http:", "https:"].includes(parsed.protocol) ||
                      !["localhost", "127.0.0.1", "[::1]"].includes(
                        parsed.hostname,
                      )
                    )
                      throw new Error("Use a localhost URL");
                    setFrameUrl(parsed.href);
                  } catch (err) {
                    setError(String(err));
                  }
                }}
              >
                <ExternalLink className="size-3" />
                {tr("Открыть", "Open")}
              </Button>
            </div>
            {frameUrl && (
              <iframe
                title="Application preview"
                src={frameUrl}
                sandbox="allow-scripts allow-forms allow-same-origin"
                className="w-full h-[420px] rounded border border-border bg-white"
              />
            )}
            <label className="block text-xs space-y-2">
              <span>
                {tr(
                  "CSS-селектор элемента (необязательно)",
                  "Element CSS selector (optional)",
                )}
              </span>
              <input
                className={inputClass}
                value={selector}
                onChange={(e) => setSelector(e.target.value)}
                placeholder="main, #checkout, .header"
              />
            </label>
            <div className="flex gap-2">
              {[false, true].map((mobile) => (
                <Button
                  key={String(mobile)}
                  variant="outline"
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    void runAction(async () => {
                      const capture = await request<Capture>(
                        `${base}/capture`,
                        "POST",
                        { url, mobile, selector: selector || undefined },
                      );
                      setCaptures((current) =>
                        [capture, ...current].slice(0, 6),
                      );
                    })
                  }
                >
                  <Camera className="size-3" />
                  {mobile ? "Mobile" : "Desktop"}
                </Button>
              ))}
            </div>
            {captures.map((capture) => (
              <div
                key={capture.id}
                className="border border-border rounded p-2 space-y-2"
              >
                <a href={capture.url} target="_blank" rel="noreferrer">
                  <img
                    src={capture.url}
                    alt={`${capture.title} — ${capture.viewport}`}
                    className="max-h-56 object-contain mx-auto"
                  />
                </a>
                <div className="flex justify-between text-xs items-center">
                  <span>{capture.viewport}</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onAttach(capture.id);
                      setMessage(
                        tr(
                          "Снимок приложен к следующему сообщению",
                          "Screenshot attached to the next message",
                        ),
                      );
                    }}
                  >
                    {tr("В чат", "Attach to chat")}
                  </Button>
                </div>
                {capture.errors.length > 0 && (
                  <pre className="text-xs text-destructive whitespace-pre-wrap">
                    {capture.errors.join("\n")}
                  </pre>
                )}
              </div>
            ))}
            <details open>
              <summary className="text-xs cursor-pointer">
                {tr("Логи сервера", "Server logs")}
              </summary>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-[11px] bg-muted/30 rounded p-3 mt-2">
                {preview.logs || tr("Нет вывода", "No output")}
              </pre>
            </details>
          </>
        )}
        {tab === "memory" && (
          <>
            <p className="text-xs text-muted-foreground">
              {tr(
                "Соглашения проекта, команды запуска и важные решения. Эти заметки добавляются в контекст новых запусков.",
                "Project conventions, commands and decisions. These notes are included in new runs.",
              )}
            </p>
            <textarea
              className={`${inputClass} min-h-60 font-mono`}
              aria-label={tr("Память проекта", "Project memory")}
              value={memory}
              maxLength={30000}
              onChange={(e) => setMemory(e.target.value)}
            />
            <Button
              size="sm"
              disabled={busy}
              onClick={() =>
                void runAction(async () => {
                  await request(`${base}/memory`, "PUT", { content: memory });
                  setMessage(tr("Память сохранена", "Memory saved"));
                })
              }
            >
              {tr("Сохранить", "Save")}
            </Button>
            <div className="border-t border-border pt-4 space-y-3">
              <h3 className="text-sm">
                {tr("Полная история", "Full history")}
              </h3>
              <input
                className={inputClass}
                placeholder={tr("Поиск в истории…", "Search history…")}
                value={historyQuery}
                onChange={(e) => setHistoryQuery(e.target.value)}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={busy}
                onClick={() =>
                  void runAction(async () => {
                    const rows = await request<{ data: unknown }[]>(
                      `${base}/history?q=${encodeURIComponent(historyQuery)}`,
                    );
                    setHistory(
                      rows.map((row) => JSON.stringify(row.data, null, 2)),
                    );
                  })
                }
              >
                {tr("Найти", "Search")}
              </Button>
              {history.map((text, i) => (
                <pre
                  key={i}
                  className="text-[11px] whitespace-pre-wrap max-h-60 overflow-auto border-b border-border pb-3"
                >
                  {text}
                </pre>
              ))}
            </div>
          </>
        )}
        {tab === "runs" && (
          <>
            <textarea
              className={`${inputClass} min-h-24`}
              value={queue}
              onChange={(e) => setQueue(e.target.value)}
              placeholder={tr("Следующая задача…", "Next task…")}
            />
            <Button
              size="sm"
              disabled={busy || !queue.trim()}
              onClick={() =>
                void runAction(async () => {
                  await request(`${base}/queue`, "POST", {
                    prompt: queue,
                    model,
                  });
                  setQueue("");
                  onRun();
                })
              }
            >
              {tr("Добавить в очередь", "Queue task")}
            </Button>
            {runs.map((item) => (
              <article
                key={item.id}
                className="border border-border rounded p-3 space-y-2"
              >
                <div className="flex justify-between text-xs">
                  <span>{item.state}</span>
                  <span className="text-muted-foreground">
                    {new Date(item.createdAt).toLocaleString()}
                  </span>
                </div>
                <p className="text-xs whitespace-pre-wrap line-clamp-4">
                  {item.prompt}
                </p>
                {item.error && (
                  <p className="text-xs text-amber-500">{item.error}</p>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setSelected(item.id);
                      setTab("changes");
                    }}
                  >
                    {tr("Изменения", "Changes")}
                  </Button>
                  {["failed", "interrupted", "cancelled"].includes(
                    item.state,
                  ) && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void runAction(async () => {
                          await request("/api/chat/resume", "POST", {
                            runId: item.id,
                          });
                          onRun();
                        })
                      }
                    >
                      {tr("Продолжить", "Resume")}
                    </Button>
                  )}
                  {item.state === "queued" && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={busy}
                      onClick={() =>
                        void runAction(() =>
                          request(`${base}/cancel?runId=${item.id}`, "POST"),
                        )
                      }
                    >
                      {tr("Убрать из очереди", "Remove")}
                    </Button>
                  )}
                </div>
              </article>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}

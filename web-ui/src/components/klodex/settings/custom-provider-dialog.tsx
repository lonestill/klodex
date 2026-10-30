import { useEffect, useState } from "react";
import { Check, Loader2, Plus, Sparkles, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";
import { api, type KlodexProvider } from "@/lib/api";

export interface CustomModelItem {
  id: string;
  name?: string;
  contextWindow?: number;
}

interface CustomProviderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialProvider?: KlodexProvider | null;
  onSaved: (providerId: string) => void;
}

const PRESETS = [
  {
    name: "OpenCode Proxy",
    id: "opencode-proxy",
    baseURL: "http://127.0.0.1:8080/v1",
    defaultModels: ["deepseek-v4.1-flash-free", "gemini-2.5-flash", "gpt-4o-mini"],
  },
  {
    name: "Ollama",
    id: "ollama",
    baseURL: "http://127.0.0.1:11434/v1",
    defaultModels: ["llama3.1:latest", "qwen2.5-coder:latest"],
  },
  {
    name: "LM Studio",
    id: "lm-studio",
    baseURL: "http://127.0.0.1:1234/v1",
    defaultModels: ["local-model"],
  },
  {
    name: "vLLM",
    id: "vllm",
    baseURL: "http://127.0.0.1:8000/v1",
    defaultModels: ["default"],
  },
];

export function CustomProviderDialog({
  open,
  onOpenChange,
  initialProvider,
  onSaved,
}: CustomProviderDialogProps) {
  const { t, lang } = useI18n();

  const [name, setName] = useState("");
  const [id, setId] = useState("");
  const [baseURL, setBaseURL] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [models, setModels] = useState<CustomModelItem[]>([]);
  const [newModelInput, setNewModelInput] = useState("");

  const [probing, setProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<{
    ok: boolean;
    count?: number;
    error?: string;
  } | null>(null);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync state when dialog opens or initialProvider changes
  useEffect(() => {
    if (open) {
      if (initialProvider) {
        setName(initialProvider.name || "");
        setId(initialProvider.id || "");
        setBaseURL(initialProvider.baseURL || "");
        setApiKey("");
        setModels(
          initialProvider.models.map((m) => ({
            id: m.id,
            name: m.name,
            contextWindow: m.contextWindow,
          })),
        );
      } else {
        setName("");
        setId("");
        setBaseURL("");
        setApiKey("");
        setModels([]);
      }
      setProbeResult(null);
      setError(null);
      setNewModelInput("");
    }
  }, [open, initialProvider]);

  const handleApplyPreset = (preset: (typeof PRESETS)[number]) => {
    setName(preset.name);
    setId(preset.id);
    setBaseURL(preset.baseURL);
    setProbeResult(null);
    if (models.length === 0) {
      setModels(preset.defaultModels.map((m) => ({ id: m })));
    }
  };

  const handleNameChange = (val: string) => {
    setName(val);
    if (!initialProvider && (!id || id === name.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))) {
      setId(val.toLowerCase().replace(/[^a-z0-9_-]/g, "-"));
    }
  };

  const handleAddModel = () => {
    const trimmed = newModelInput.trim();
    if (!trimmed) return;
    if (models.some((m) => m.id === trimmed)) {
      setNewModelInput("");
      return;
    }
    setModels((prev) => [...prev, { id: trimmed }]);
    setNewModelInput("");
  };

  const handleRemoveModel = (modelId: string) => {
    setModels((prev) => prev.filter((m) => m.id !== modelId));
  };

  const handleProbe = async () => {
    const cleanUrl = baseURL.trim();
    if (!cleanUrl) {
      setProbeResult({
        ok: false,
        error: lang === "ru" ? "Укажите Base URL сервера" : "Base URL is required",
      });
      return;
    }
    setProbing(true);
    setProbeResult(null);
    setError(null);

    try {
      const res = await api.probeCustomProvider(cleanUrl, apiKey.trim() || undefined);
      if (res.ok && Array.isArray(res.models) && res.models.length > 0) {
        const discovered = res.models;
        setModels((prev) => {
          const merged = [...prev];
          for (const dm of discovered) {
            const existingIdx = merged.findIndex((m) => m.id === dm.id);
            if (existingIdx >= 0) {
              merged[existingIdx] = { ...merged[existingIdx], ...dm };
            } else {
              merged.push(dm);
            }
          }
          return merged;
        });
        setProbeResult({ ok: true, count: discovered.length });
      } else if (res.ok) {
        setProbeResult({
          ok: false,
          error:
            lang === "ru"
              ? "Сервер ответил, но список моделей пуст"
              : "Server responded, but models list is empty",
        });
      } else {
        setProbeResult({
          ok: false,
          error: res.error || (lang === "ru" ? "Не удалось получить модели" : "Failed to fetch models"),
        });
      }
    } catch (e: any) {
      setProbeResult({
        ok: false,
        error: e?.message || (lang === "ru" ? "Ошибка подключения" : "Connection error"),
      });
    } finally {
      setProbing(false);
    }
  };

  const handleSave = async () => {
    const cleanName = name.trim();
    const cleanId = id.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "-");
    const cleanUrl = baseURL.trim();

    if (!cleanId) {
      setError(lang === "ru" ? "Укажите уникальный идентификатор (ID)" : "Provider ID is required");
      return;
    }
    if (!cleanUrl) {
      setError(lang === "ru" ? "Укажите Base URL" : "Base URL is required");
      return;
    }
    if (models.length === 0) {
      setError(lang === "ru" ? "Добавьте хотя бы одну модель" : "Add at least one model");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      await api.saveCustomProvider({
        id: cleanId,
        name: cleanName || cleanId,
        baseURL: cleanUrl,
        apiKey: apiKey.trim() || undefined,
        models: models.map((m) => ({
          id: m.id,
          name: m.name || m.id,
          contextWindow: m.contextWindow,
        })),
      });

      onSaved(cleanId);
      onOpenChange(false);
    } catch (e: any) {
      setError(e?.message || (lang === "ru" ? "Не удалось сохранить провайдер" : "Failed to save provider"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader className="shrink-0 space-y-1.5 pb-2">
          <DialogTitle className="font-display text-base font-semibold flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            {initialProvider
              ? lang === "ru"
                ? "Редактировать провайдер"
                : "Edit Custom Provider"
              : lang === "ru"
                ? "Добавить свой провайдер"
                : "Add Custom Provider"}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {lang === "ru"
              ? "Подключение любого OpenAI-совместимого эндпоинта: OpenCode Proxy, Ollama, LM Studio, vLLM или локального шлюза."
              : "Connect any OpenAI-compatible API endpoint: OpenCode Proxy, Ollama, LM Studio, vLLM, or custom proxies."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1 chat-scroll text-xs">
          {/* Presets */}
          {!initialProvider && (
            <div className="space-y-1.5">
              <span className="text-[11px] font-medium text-muted-foreground">
                {lang === "ru" ? "Быстрые шаблоны:" : "Quick presets:"}
              </span>
              <div className="flex flex-wrap gap-1.5">
                {PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => handleApplyPreset(p)}
                    className="rounded-lg border border-border/60 bg-card/40 px-2.5 py-1 text-[11px] font-medium hover:border-primary/50 hover:bg-primary/5 cursor-pointer transition-colors"
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Form Grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-foreground">
                {lang === "ru" ? "Название" : "Provider Name"} *
              </label>
              <Input
                placeholder="OpenCode Proxy"
                value={name}
                onChange={(e) => handleNameChange(e.target.value)}
                className="h-8 text-xs bg-card/40 border-border/60"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-foreground">
                {lang === "ru" ? "Идентификатор (ID)" : "ID (slug)"} *
              </label>
              <Input
                placeholder="opencode-proxy"
                value={id}
                disabled={Boolean(initialProvider)}
                onChange={(e) => setId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "-"))}
                className="h-8 text-xs font-mono bg-card/40 border-border/60"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-foreground">
              Base URL *
            </label>
            <Input
              placeholder="http://127.0.0.1:8080/v1"
              value={baseURL}
              onChange={(e) => setBaseURL(e.target.value)}
              className="h-8 text-xs font-mono bg-card/40 border-border/60"
            />
            <p className="text-[10px] text-muted-foreground">
              {lang === "ru"
                ? "Адрес эндпоинта, обычно заканчивается на /v1"
                : "Endpoint address, usually ends with /v1"}
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] font-medium text-foreground">
              API Key ({lang === "ru" ? "опционально" : "optional"})
            </label>
            <Input
              type="password"
              placeholder={lang === "ru" ? "Не требуется или введите ключ" : "Not needed or enter API key"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              className="h-8 text-xs font-mono bg-card/40 border-border/60"
            />
          </div>

          {/* Connection Test & Model Discovery */}
          <div className="rounded-xl border border-border/60 bg-card/30 p-3 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-xs text-foreground">
                  {lang === "ru" ? "Проверка подключения и моделей" : "Test Connection & Fetch Models"}
                </span>
                <p className="text-[10px] text-muted-foreground">
                  {lang === "ru"
                    ? "Автоматический опрос /v1/models для получения списка доступных моделей"
                    : "Automatically query /v1/models to fetch available model IDs"}
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleProbe}
                disabled={probing || !baseURL.trim()}
                className="h-7 text-xs gap-1.5 border-primary/30 hover:bg-primary/10 hover:text-primary cursor-pointer shrink-0"
              >
                {probing ? (
                  <>
                    <Loader2 className="size-3.5 animate-spin" />
                    <span>{lang === "ru" ? "Проверка..." : "Checking..."}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5 text-primary" />
                    <span>{lang === "ru" ? "Подтянуть модели" : "Fetch Models"}</span>
                  </>
                )}
              </Button>
            </div>

            {probeResult && (
              <div
                className={`rounded-lg p-2 text-xs border ${
                  probeResult.ok
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-500"
                    : "bg-destructive/10 border-destructive/30 text-destructive"
                }`}
              >
                {probeResult.ok ? (
                  <div className="flex items-center gap-1.5">
                    <Check className="size-3.5 shrink-0" />
                    <span>
                      {lang === "ru"
                        ? `Успешно подключено! Найдено моделей: ${probeResult.count}`
                        : `Successfully connected! Models discovered: ${probeResult.count}`}
                    </span>
                  </div>
                ) : (
                  <span>{probeResult.error}</span>
                )}
              </div>
            )}
          </div>

          {/* Models List Editor */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-[11px] font-medium text-foreground">
                {lang === "ru" ? "Список моделей" : "Models List"} ({models.length}) *
              </label>
              {models.length > 0 && (
                <button
                  type="button"
                  onClick={() => setModels([])}
                  className="text-[10px] text-muted-foreground hover:text-destructive cursor-pointer"
                >
                  {lang === "ru" ? "Очистить список" : "Clear all"}
                </button>
              )}
            </div>

            <div className="flex gap-2">
              <Input
                placeholder={lang === "ru" ? "Имя или ID модели (напр. deepseek-chat)" : "Model ID (e.g. deepseek-chat)"}
                value={newModelInput}
                onChange={(e) => setNewModelInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddModel();
                  }
                }}
                className="h-8 text-xs font-mono bg-card/40 border-border/60"
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddModel}
                disabled={!newModelInput.trim()}
                className="h-8 text-xs gap-1 px-3 cursor-pointer shrink-0"
              >
                <Plus className="size-3.5" />
                <span>{lang === "ru" ? "Добавить" : "Add"}</span>
              </Button>
            </div>

            {models.length === 0 ? (
              <div className="rounded-lg border border-dashed border-border/60 p-4 text-center text-[11px] text-muted-foreground">
                {lang === "ru"
                  ? "Модели еще не добавлены. Введите название модели вручную или нажмите «Подтянуть модели» выше."
                  : "No models added yet. Enter a model ID manually or click 'Fetch Models' above."}
              </div>
            ) : (
              <div className="max-h-40 overflow-y-auto space-y-1 rounded-lg border border-border/40 p-1.5 bg-card/20 chat-scroll">
                {models.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between gap-2 rounded-md bg-card/40 px-2 py-1 text-xs border border-border/30 hover:border-border/60"
                  >
                    <div className="min-w-0 flex items-center gap-1.5 flex-1">
                      <span className="font-mono text-[11px] truncate text-foreground">{m.id}</span>
                      {m.contextWindow && (
                        <Badge variant="outline" className="h-3.5 px-1 font-mono text-[8px] text-muted-foreground">
                          {Math.round(m.contextWindow / 1000)}k
                        </Badge>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveModel(m.id)}
                      className="text-muted-foreground hover:text-destructive cursor-pointer p-0.5 rounded transition-colors"
                      title={lang === "ru" ? "Удалить" : "Remove"}
                    >
                      <X className="size-3" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-2.5 text-xs text-destructive">
              {error}
            </div>
          )}
        </div>

        <DialogFooter className="shrink-0 pt-3 border-t border-border/40 flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={saving}
            className="h-8 text-xs cursor-pointer"
          >
            {lang === "ru" ? "Отмена" : "Cancel"}
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={saving || !name.trim() || !id.trim() || !baseURL.trim() || models.length === 0}
            className="h-8 text-xs gap-1.5 cursor-pointer bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {saving ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                <span>{lang === "ru" ? "Сохранение..." : "Saving..."}</span>
              </>
            ) : (
              <>
                <Check className="size-3.5" />
                <span>{lang === "ru" ? "Сохранить провайдер" : "Save Provider"}</span>
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

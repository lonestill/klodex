import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCcw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[Klodex ErrorBoundary caught error]:", error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleResetAndReload = () => {
    try {
      localStorage.removeItem("klodex_active_session_id");
      localStorage.removeItem("klodex_model");
    } catch {}
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full flex items-center justify-center bg-background p-6 text-foreground select-none">
          <div className="max-w-md w-full rounded-xl border border-destructive/40 bg-card p-6 shadow-xl space-y-4 animate-in fade-in duration-200">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-lg bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
                <AlertTriangle className="size-5" />
              </div>
              <div>
                <h3 className="font-semibold text-sm text-foreground">
                  {this.props.fallbackTitle || "Сбой интерфейса (UI Crash)"}
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">
                  React поймал необработанное исключение вместо падения в чёрный экран.
                </p>
              </div>
            </div>

            {this.state.error && (
              <div className="rounded-md bg-muted/50 border border-border/60 p-3 font-mono text-[11px] text-destructive leading-relaxed break-all max-h-40 overflow-y-auto">
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div className="flex items-center gap-2 pt-2">
              <Button
                variant="default"
                size="sm"
                className="flex-1 gap-1.5 cursor-pointer"
                onClick={this.handleReload}
              >
                <RotateCcw className="size-3.5" />
                <span>Перезагрузить</span>
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 border-border/80 text-muted-foreground hover:text-foreground cursor-pointer"
                onClick={this.handleResetAndReload}
                title="Сбросить выбранную модель/сессию и перезагрузить"
              >
                <Trash2 className="size-3.5" />
                <span>Сбросить стейт</span>
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

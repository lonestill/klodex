import { useState } from "react";
import {
  Check,
  Copy,
  ExternalLink,
  Heart,
  Sparkles,
  Star,
  Wallet,
  Zap,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/lib/i18n";

interface SponsorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const DONATION_EVM_ADDRESS = "0x11111114b44E6ba7B2649c5DC527134159E7D16B";
export const DONATION_SOLANA_ADDRESS = "CDByxDCSd8h99qn9eqiKZK2UqBNZeb9oHfCCQEzbrZgu";
export const GITHUB_REPO_URL = "https://github.com/lonestill/klodex";

const EVM_NETWORKS = [
  "Base",
  "Polygon",
  "Arbitrum",
  "BNB Chain",
  "Ethereum",
  "HyperEVM",
  "Optimism",
];

export function SponsorDialog({ open, onOpenChange }: SponsorDialogProps) {
  const { t, lang } = useI18n();
  const [copiedEVM, setCopiedEVM] = useState(false);
  const [copiedSOL, setCopiedSOL] = useState(false);

  const copyText = async (text: string, setCopiedState: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedState(true);
      setTimeout(() => setCopiedState(false), 2400);
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      setCopiedState(true);
      setTimeout(() => setCopiedState(false), 2400);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[490px] p-0 overflow-hidden border-border/70 bg-card/95 shadow-2xl backdrop-blur-xl">
        {/* Subtle Ambient Glow */}
        <div className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 size-56 rounded-full bg-rose-500/10 blur-3xl" />

        {/* Dialog Header */}
        <DialogHeader className="p-5 pb-4 border-b border-border/50 bg-muted/15 relative">
          <div className="flex items-center gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-2xl border border-rose-500/30 bg-rose-500/10 text-rose-400 shadow-xs ring-1 ring-rose-500/20">
              <Heart className="size-5 fill-rose-500/30 animate-pulse text-rose-400" />
            </div>
            <div className="min-w-0">
              <DialogTitle className="font-display text-base font-semibold tracking-tight text-foreground flex items-center gap-2">
                <span>{t("sponsor.title")}</span>
                <Badge variant="outline" className="border-rose-500/30 bg-rose-500/10 text-rose-300 font-mono text-[10px] px-1.5 py-0">
                  @lonestill
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                {t("sponsor.desc")}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Body Content */}
        <div className="p-5 space-y-3.5 max-h-[75vh] overflow-y-auto chat-scroll">
          {/* EVM Multi-chain Card */}
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-3.5 relative overflow-hidden transition-all hover:border-border">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <Wallet className="size-3.5 text-primary" />
                <span className="text-xs font-semibold text-foreground">
                  {t("sponsor.evmTitle")}
                </span>
              </div>
              <span className="text-[10px] font-mono font-medium text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-md">
                EVM Universal
              </span>
            </div>

            <p className="text-[11px] text-muted-foreground mb-2.5 leading-relaxed">
              {t("sponsor.evmSub")}
            </p>

            {/* Address Box */}
            <div className="group relative flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-background/80 px-2.5 py-2 font-mono text-xs shadow-inner">
              <span className="truncate text-foreground/90 font-medium select-all text-[11px]">
                {DONATION_EVM_ADDRESS}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyText(DONATION_EVM_ADDRESS, setCopiedEVM)}
                className="h-6.5 shrink-0 cursor-pointer gap-1.5 rounded-lg px-2 text-xs font-medium transition-all hover:bg-primary/10 hover:text-primary"
              >
                {copiedEVM ? (
                  <>
                    <Check className="size-3 text-emerald-400" />
                    <span className="text-[10.5px] text-emerald-400 font-semibold">
                      {t("sponsor.copied")}
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3 text-muted-foreground" />
                    <span className="text-[10.5px]">{t("sponsor.copy")}</span>
                  </>
                )}
              </Button>
            </div>

            {/* Supported Networks Tags */}
            <div className="mt-2.5 flex flex-wrap gap-1">
              {EVM_NETWORKS.map((net) => (
                <span
                  key={net}
                  className="rounded-md border border-border/60 bg-muted/40 px-1.5 py-0.5 text-[9.5px] font-medium text-muted-foreground"
                >
                  {net}
                </span>
              ))}
            </div>

            {/* Supported Tokens */}
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Sparkles className="size-3 text-amber-400 shrink-0" />
              <span>{lang === "ru" ? "Токены:" : "Tokens:"}</span>
              <span className="font-mono text-foreground/85 font-medium">
                USDT · USDC · ETH · BNB · POL
              </span>
            </div>
          </div>

          {/* Solana Card */}
          <div className="rounded-2xl border border-border/70 bg-muted/20 p-3.5 relative overflow-hidden transition-all hover:border-border">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <div className="flex items-center gap-2">
                <Zap className="size-3.5 text-purple-400" />
                <span className="text-xs font-semibold text-foreground">
                  Solana
                </span>
              </div>
              <span className="text-[10px] font-mono font-medium text-purple-400 bg-purple-500/10 border border-purple-500/20 px-1.5 py-0.5 rounded-md">
                Fast & Cheap
              </span>
            </div>

            <p className="text-[11px] text-muted-foreground mb-2.5 leading-relaxed">
              {lang === "ru"
                ? "Сеть Solana (SOL, USDT SPL, USDC SPL)"
                : "Solana Network (SOL, USDT SPL, USDC SPL)"}
            </p>

            {/* Address Box */}
            <div className="group relative flex items-center justify-between gap-2 rounded-xl border border-border/80 bg-background/80 px-2.5 py-2 font-mono text-xs shadow-inner">
              <span className="truncate text-foreground/90 font-medium select-all text-[11px]">
                {DONATION_SOLANA_ADDRESS}
              </span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => copyText(DONATION_SOLANA_ADDRESS, setCopiedSOL)}
                className="h-6.5 shrink-0 cursor-pointer gap-1.5 rounded-lg px-2 text-xs font-medium transition-all hover:bg-purple-500/15 hover:text-purple-300"
              >
                {copiedSOL ? (
                  <>
                    <Check className="size-3 text-emerald-400" />
                    <span className="text-[10.5px] text-emerald-400 font-semibold">
                      {t("sponsor.copied")}
                    </span>
                  </>
                ) : (
                  <>
                    <Copy className="size-3 text-muted-foreground" />
                    <span className="text-[10.5px]">{t("sponsor.copy")}</span>
                  </>
                )}
              </Button>
            </div>

            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Sparkles className="size-3 text-purple-400 shrink-0" />
              <span>{lang === "ru" ? "Токены:" : "Tokens:"}</span>
              <span className="font-mono text-foreground/85 font-medium">
                SOL · USDT · USDC
              </span>
            </div>
          </div>

          {/* GitHub Star Card (Free Way to Support) */}
          <a
            href={GITHUB_REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex items-center justify-between rounded-2xl border border-border/70 bg-muted/15 p-3 text-left transition-all hover:border-amber-500/30 hover:bg-amber-500/5 cursor-pointer"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex size-7.5 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-400 group-hover:scale-105 transition-transform">
                <Star className="size-3.5 fill-amber-400/40 text-amber-400" />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-semibold text-foreground group-hover:text-amber-400 transition-colors">
                  {t("sponsor.starTitle")}
                </div>
                <div className="text-[10.5px] text-muted-foreground truncate">
                  {t("sponsor.starSub")}
                </div>
              </div>
            </div>
            <ExternalLink className="size-3.5 text-muted-foreground group-hover:text-foreground shrink-0 transition-colors ml-2" />
          </a>
        </div>
      </DialogContent>
    </Dialog>
  );
}

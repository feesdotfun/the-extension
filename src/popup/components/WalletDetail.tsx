import { useState, useEffect, useRef } from "react";
import {
  ArrowLeft,
  Copy,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  Save,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { error as logError } from "@/lib/log";
import { getTurnkeyClient, exportAccountKey, renameWallet } from "@/lib/turnkey";
import { PLATFORMS } from "@/lib/platforms";
import type { DeployerConfig } from "@/lib/platforms";
import type { Wallet, WalletAccount, TurnkeySession } from "@/lib/types";

interface WalletDetailProps {
  wallet: Wallet;
  session: TurnkeySession;
  deployerConfig: DeployerConfig;
  onBack: () => void;
  onRenamed: () => void;
  onDeployerConfigChanged: (config: DeployerConfig) => void;
}

export function WalletDetail({
  wallet,
  session,
  deployerConfig,
  onBack,
  onRenamed,
  onDeployerConfigChanged,
}: WalletDetailProps) {
  const [name, setName] = useState(wallet.walletName);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState("");
  const [renameSuccess, setRenameSuccess] = useState("");

  const solanaAddress = wallet.accounts.find(
    (a) => a.addressFormat === "ADDRESS_FORMAT_SOLANA"
  )?.address;

  const handleTogglePlatform = (platformId: string) => {
    const newConfig = { ...deployerConfig };
    if (newConfig[platformId as keyof DeployerConfig] === solanaAddress) {
      delete newConfig[platformId as keyof DeployerConfig];
    } else if (solanaAddress) {
      (newConfig as Record<string, string>)[platformId] = solanaAddress;
    }
    onDeployerConfigChanged(newConfig);
  };

  const handleRename = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setRenameError("Name cannot be empty");
      return;
    }
    if (trimmed === wallet.walletName) return;

    setRenaming(true);
    setRenameError("");
    setRenameSuccess("");
    try {
      const client = getTurnkeyClient(session);
      await renameWallet(client, wallet.walletId, trimmed);
      setRenameSuccess("Wallet renamed");
      setTimeout(() => {
        setRenameSuccess("");
        onRenamed();
      }, 1200);
    } catch (err) {
      logError("Rename error:", err);
      setRenameError(
        err instanceof Error ? err.message : "Failed to rename wallet"
      );
    } finally {
      setRenaming(false);
    }
  };

  return (
    <div className="flex flex-col animate-fade-in h-[600px] overflow-hidden relative">
      {/* Internal ambient glow */}
      <div
        className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[200px] rounded-full blur-3xl pointer-events-none"
        style={{ background: "radial-gradient(ellipse, hsl(213 100% 50% / 0.06), transparent 70%)" }}
      />

      {/* Top gradient accent bar */}
      <div className="flex w-full h-[2px] shrink-0 relative z-10">
        <div
          className="flex-1"
          style={{ background: "linear-gradient(90deg, transparent, hsl(213 100% 50% / 0.4), hsl(152 100% 38% / 0.3), transparent)" }}
        />
      </div>

      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-3 shrink-0 relative z-10">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-xl flex items-center justify-center glass-subtle text-muted-foreground hover:text-foreground transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-sm font-bold text-foreground truncate font-display">
          {wallet.walletName}
        </h2>
      </div>

      <div className="px-5 pb-5 flex flex-col gap-5 overflow-y-auto flex-1 min-h-0 relative z-10">
        {/* Rename Section */}
        <div>
          <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-2">
            Rename Wallet
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={renaming}
              className={cn(
                "flex-1 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground/40",
                "focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all",
                renaming && "opacity-50 cursor-not-allowed"
              )}
              style={{
                background: "hsl(0 0% 100% / 0.03)",
                border: "1px solid hsl(0 0% 100% / 0.06)",
              }}
            />
            <button
              onClick={handleRename}
              disabled={renaming || name.trim() === wallet.walletName}
              className={cn(
                "px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all",
                renaming || name.trim() === wallet.walletName
                  ? "glass-subtle text-muted-foreground/40 cursor-not-allowed"
                  : "bg-primary text-primary-foreground glow-blue glow-blue-hover"
              )}
            >
              {renaming ? (
                <div className="w-3.5 h-3.5 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              Save
            </button>
          </div>
          {renameError && (
            <div className="flex items-center gap-1.5 mt-2">
              <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
              <span className="text-[11px] text-destructive">{renameError}</span>
            </div>
          )}
          {renameSuccess && (
            <div className="flex items-center gap-1.5 mt-2">
              <Check className="w-3.5 h-3.5 text-accent flex-shrink-0" />
              <span className="text-[11px] text-accent">{renameSuccess}</span>
            </div>
          )}
        </div>

        {/* Deployer For Section */}
        {solanaAddress && (
          <div>
            <div className="flex items-center gap-2 mb-2.5">
              <Globe className="w-3.5 h-3.5 text-primary" />
              <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
                Deployer For
              </label>
            </div>
            <div className="flex flex-col gap-2">
              {PLATFORMS.filter((p) => !p.alwaysActive).map((platform) => {
                const isChecked = deployerConfig[platform.id as keyof DeployerConfig] === solanaAddress;
                return (
                  <button
                    key={platform.id}
                    onClick={() => handleTogglePlatform(platform.id)}
                    className={cn(
                      "flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left group",
                      isChecked
                        ? "bg-primary/10 border border-primary/25"
                        : "glass-subtle hover:border-primary/25"
                    )}
                  >
                    <div
                      className={cn(
                        "w-4 h-4 rounded flex-shrink-0 border flex items-center justify-center transition-all",
                        isChecked
                          ? "bg-primary border-primary"
                          : "border-muted-foreground/30 bg-transparent group-hover:border-muted-foreground/50"
                      )}
                    >
                      {isChecked && <Check className="w-3 h-3 text-primary-foreground" />}
                    </div>
                    <div
                      className="w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 bg-muted/60 border border-border/40"
                    >
                      <img
                        src={platform.logo}
                        alt={platform.name}
                        className="w-3.5 h-3.5 rounded-sm"
                      />
                    </div>
                    <span
                      className={cn(
                        "text-xs font-semibold transition-colors",
                        isChecked ? "text-foreground" : "text-muted-foreground group-hover:text-foreground/80"
                      )}
                    >
                      {platform.name}
                    </span>
                    {isChecked && (
                      <div
                        className="ml-auto w-1.5 h-1.5 rounded-full bg-accent"
                        style={{ boxShadow: "0 0 4px hsl(152 100% 38% / 0.6)" }}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Accounts Section */}
        <div>
          <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider block mb-2.5">
            Accounts
          </label>
          <div className="flex flex-col gap-2">
            {wallet.accounts.map((account, i) => (
              <AccountRow
                key={i}
                account={account}
                session={session}
                wallet={wallet}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AccountRow({
  account,
  session,
  wallet,
}: {
  account: WalletAccount;
  session: TurnkeySession;
  wallet: Wallet;
}) {
  const [exportedKey, setExportedKey] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const clearTimerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
    };
  }, []);

  const chainLabel =
    account.addressFormat === "ADDRESS_FORMAT_SOLANA" ? "Solana" : "EVM";

  function truncateAddress(addr: string) {
    if (addr.length <= 16) return addr;
    return `${addr.slice(0, 8)}...${addr.slice(-6)}`;
  }

  const handleExport = async () => {
    setExporting(true);
    setError("");
    try {
      const client = getTurnkeyClient(session);
      const chain = account.addressFormat === "ADDRESS_FORMAT_SOLANA" ? "solana" as const : "evm" as const;
      const key = await exportAccountKey(client, session, account.address, {
        walletId: wallet.walletId,
        walletName: wallet.walletName,
        chain,
      });
      setExportedKey(key);
      setShowConfirm(false);
      clearTimerRef.current = setTimeout(() => {
        setExportedKey(null);
        setRevealed(false);
      }, 60_000);
    } catch (err) {
      logError("Export error:", err);
      setError(
        err instanceof Error ? err.message : "Failed to export key"
      );
    } finally {
      setExporting(false);
    }
  };

  const handleCopyKey = () => {
    if (!exportedKey) return;
    navigator.clipboard.writeText(exportedKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClearKey = () => {
    setExportedKey(null);
    setRevealed(false);
    setShowConfirm(false);
    if (clearTimerRef.current) clearTimeout(clearTimerRef.current);
  };

  return (
    <div className="glass-subtle rounded-xl px-4 py-3.5">
      {/* Address row */}
      <div className="flex items-center justify-between mb-2.5">
        <div>
          <span className="text-[9px] text-muted-foreground/50 font-semibold uppercase tracking-widest">
            {chainLabel}
          </span>
          <p className="text-[11px] text-foreground/70 font-mono mt-0.5">
            {truncateAddress(account.address)}
          </p>
        </div>
      </div>

      {/* Export flow */}
      {!exportedKey && !showConfirm && (
        <button
          onClick={() => setShowConfirm(true)}
          disabled={exporting}
          className="w-full py-2.5 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-2 transition-all glass-subtle text-muted-foreground hover:text-foreground hover:border-primary/25"
        >
          <Eye className="w-3.5 h-3.5" />
          Export Private Key
        </button>
      )}

      {showConfirm && !exportedKey && (
        <div className="flex flex-col gap-2">
          <div
            className="flex items-start gap-2.5 px-3.5 py-2.5 rounded-xl"
            style={{ background: "hsl(38 92% 50% / 0.08)", border: "1px solid hsl(38 92% 50% / 0.15)" }}
          >
            <AlertCircle className="w-3.5 h-3.5 text-amber-400 flex-shrink-0 mt-0.5" />
            <span className="text-[11px] text-amber-400 leading-relaxed">
              Your private key grants full access to this account. Never share
              it with anyone.
            </span>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowConfirm(false)}
              disabled={exporting}
              className="flex-1 py-2.5 rounded-xl text-[11px] font-semibold glass-subtle text-muted-foreground hover:text-foreground transition-all"
            >
              Cancel
            </button>
            <button
              onClick={handleExport}
              disabled={exporting}
              className={cn(
                "flex-1 py-2.5 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all",
                exporting
                  ? "bg-destructive/20 text-destructive/70 cursor-not-allowed"
                  : "bg-destructive/10 text-destructive hover:bg-destructive/20"
              )}
              style={{ border: "1px solid hsl(0 84% 60% / 0.2)" }}
            >
              {exporting ? (
                <div className="w-3 h-3 border-2 border-destructive/30 border-t-destructive rounded-full animate-spin" />
              ) : (
                "Confirm Export"
              )}
            </button>
          </div>
        </div>
      )}

      {exportedKey && (
        <div className="flex flex-col gap-2">
          <div
            onClick={() => setRevealed(!revealed)}
            className="relative px-3.5 py-2.5 rounded-xl cursor-pointer group"
            style={{ background: "hsl(0 0% 100% / 0.03)", border: "1px solid hsl(0 0% 100% / 0.06)" }}
          >
            <p className="text-[11px] font-mono text-foreground/70 break-all select-all pr-6">
              {revealed
                ? exportedKey
                : "\u2022".repeat(Math.min(exportedKey.length, 40))}
            </p>
            <div className="absolute top-2.5 right-3 text-muted-foreground/40 group-hover:text-foreground/70 transition-colors">
              {revealed ? (
                <EyeOff className="w-3.5 h-3.5" />
              ) : (
                <Eye className="w-3.5 h-3.5" />
              )}
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleCopyKey}
              className="flex-1 py-2.5 rounded-xl text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-all bg-primary/10 text-primary hover:bg-primary/15"
              style={{ border: "1px solid hsl(213 100% 50% / 0.2)" }}
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-accent" />
                  <span className="text-accent">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </>
              )}
            </button>
            <button
              onClick={handleClearKey}
              className="flex-1 py-2.5 rounded-xl text-[11px] font-semibold glass-subtle text-muted-foreground hover:text-foreground transition-all"
            >
              Clear
            </button>
          </div>
          <p className="text-[10px] text-muted-foreground/40 text-center">
            Auto-clears in 60 seconds
          </p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-1.5 mt-2">
          <AlertCircle className="w-3.5 h-3.5 text-destructive flex-shrink-0" />
          <span className="text-[11px] text-destructive">{error}</span>
        </div>
      )}
    </div>
  );
}

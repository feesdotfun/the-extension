import { useState } from "react";
import { ArrowLeft, Download, AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { error as logError } from "@/lib/log";
import { getTurnkeyClient, importPrivateKey, importSeedPhrase } from "@/lib/turnkey";
import type { TurnkeySession } from "@/lib/types";

interface ImportWalletProps {
  session: TurnkeySession;
  onBack: () => void;
  onImported: () => void;
}

type ImportTab = "private-key" | "seed-phrase";

export function ImportWallet({ session, onBack, onImported }: ImportWalletProps) {
  const [tab, setTab] = useState<ImportTab>("private-key");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  // Private key state
  const [pkName, setPkName] = useState("");
  const [pkValue, setPkValue] = useState("");
  const [pkFormat, setPkFormat] = useState<"solana" | "evm">("solana");

  // Seed phrase state
  const [spName, setSpName] = useState("");
  const [spMnemonic, setSpMnemonic] = useState("");
  const [spSolana, setSpSolana] = useState(true);
  const [spEvm, setSpEvm] = useState(true);

  const handleImportPrivateKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pkName.trim() || !pkValue.trim()) {
      setError("Name and private key are required");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const client = getTurnkeyClient(session);
      const result = await importPrivateKey(client, session, pkName.trim(), pkValue.trim(), pkFormat);
      setSuccess(
        `Imported! Address: ${result.addresses[0]?.address?.slice(0, 12)}...`
      );
      setTimeout(() => onImported(), 1500);
    } catch (err) {
      logError("Import private key error:", err);
      setError(err instanceof Error ? err.message : "Failed to import key");
    } finally {
      setLoading(false);
    }
  };

  const handleImportSeedPhrase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!spName.trim() || !spMnemonic.trim()) {
      setError("Name and seed phrase are required");
      return;
    }
    if (!spSolana && !spEvm) {
      setError("Select at least one chain");
      return;
    }

    const words = spMnemonic.trim().split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setError("Seed phrase must be 12 or 24 words");
      return;
    }

    setLoading(true);
    setError("");
    setSuccess("");
    try {
      const chains: ("solana" | "evm")[] = [];
      if (spSolana) chains.push("solana");
      if (spEvm) chains.push("evm");

      const client = getTurnkeyClient(session);
      await importSeedPhrase(client, session, spName.trim(), spMnemonic.trim(), chains);
      setSuccess("Wallet imported successfully!");
      setTimeout(() => onImported(), 1500);
    } catch (err) {
      logError("Import wallet error:", err);
      setError(err instanceof Error ? err.message : "Failed to import wallet");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col animate-fade-in">
      {/* Header */}
      <div className="px-5 pt-5 pb-4 flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-xl flex items-center justify-center bg-surface-raised border border-surface-border text-gray-400 hover:text-gray-200 hover:bg-surface-overlay hover:border-surface-border-light transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h2 className="text-sm font-bold text-white">Import Wallet</h2>
      </div>

      {/* Tab Selector */}
      <div className="px-5 pb-4">
        <div className="flex bg-surface-raised rounded-xl border border-surface-border p-1 gap-1">
          <button
            onClick={() => { setTab("private-key"); setError(""); setSuccess(""); }}
            className={cn(
              "flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all",
              tab === "private-key"
                ? "bg-brand text-white shadow-md shadow-brand-glow"
                : "text-gray-500 hover:text-gray-300 hover:bg-surface-overlay"
            )}
          >
            Private Key
          </button>
          <button
            onClick={() => { setTab("seed-phrase"); setError(""); setSuccess(""); }}
            className={cn(
              "flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold transition-all",
              tab === "seed-phrase"
                ? "bg-brand text-white shadow-md shadow-brand-glow"
                : "text-gray-500 hover:text-gray-300 hover:bg-surface-overlay"
            )}
          >
            Seed Phrase
          </button>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/15">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-400">{error}</span>
          </div>
        </div>
      )}
      {success && (
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-emerald-500/8 border border-emerald-500/15">
            <Check className="w-4 h-4 text-emerald-400 flex-shrink-0" />
            <span className="text-xs text-emerald-400">{success}</span>
          </div>
        </div>
      )}

      {/* Forms */}
      <div className="px-5 pb-5">
        {tab === "private-key" ? (
          <form onSubmit={handleImportPrivateKey} className="flex flex-col gap-4">
            <div>
              <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                Name
              </label>
              <input
                type="text"
                placeholder="e.g. My Imported Key"
                value={pkName}
                onChange={(e) => setPkName(e.target.value)}
                disabled={loading}
                className={cn(
                  "w-full bg-surface-raised border border-surface-border rounded-xl px-4 py-3.5 text-sm text-gray-200 placeholder-gray-600",
                  "focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/15 focus:bg-surface-overlay transition-all",
                  loading && "opacity-50 cursor-not-allowed"
                )}
              />
            </div>

            <div>
              <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                Format
              </label>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setPkFormat("solana")}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all",
                    pkFormat === "solana"
                      ? "bg-brand-subtle border-brand/25 text-white"
                      : "bg-surface-raised border-surface-border text-gray-500 hover:border-surface-border-light hover:text-gray-300"
                  )}
                >
                  Solana
                </button>
                <button
                  type="button"
                  onClick={() => setPkFormat("evm")}
                  className={cn(
                    "flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-all",
                    pkFormat === "evm"
                      ? "bg-brand-subtle border-brand/25 text-white"
                      : "bg-surface-raised border-surface-border text-gray-500 hover:border-surface-border-light hover:text-gray-300"
                  )}
                >
                  Ethereum
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                Private Key
              </label>
              <input
                type="password"
                placeholder="Enter private key (hex)"
                value={pkValue}
                onChange={(e) => setPkValue(e.target.value)}
                disabled={loading}
                className={cn(
                  "w-full bg-surface-raised border border-surface-border rounded-xl px-4 py-3.5 text-sm text-gray-200 placeholder-gray-600 font-mono",
                  "focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/15 focus:bg-surface-overlay transition-all",
                  loading && "opacity-50 cursor-not-allowed"
                )}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all",
                loading
                  ? "bg-brand/50 text-white/70 cursor-not-allowed"
                  : "bg-brand text-white hover:bg-brand-dark shadow-lg shadow-brand-glow active:scale-[0.98]"
              )}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Import Key
                </>
              )}
            </button>
          </form>
        ) : (
          <form onSubmit={handleImportSeedPhrase} className="flex flex-col gap-4">
            <div>
              <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                Name
              </label>
              <input
                type="text"
                placeholder="e.g. My Recovered Wallet"
                value={spName}
                onChange={(e) => setSpName(e.target.value)}
                disabled={loading}
                className={cn(
                  "w-full bg-surface-raised border border-surface-border rounded-xl px-4 py-3.5 text-sm text-gray-200 placeholder-gray-600",
                  "focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/15 focus:bg-surface-overlay transition-all",
                  loading && "opacity-50 cursor-not-allowed"
                )}
              />
            </div>

            <div>
              <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider block mb-2">
                Seed Phrase (12 or 24 words)
              </label>
              <textarea
                placeholder="word1 word2 word3 ..."
                value={spMnemonic}
                onChange={(e) => setSpMnemonic(e.target.value)}
                disabled={loading}
                rows={3}
                className={cn(
                  "w-full bg-surface-raised border border-surface-border rounded-xl px-4 py-3.5 text-sm text-gray-200 placeholder-gray-600 font-mono resize-none",
                  "focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/15 focus:bg-surface-overlay transition-all",
                  loading && "opacity-50 cursor-not-allowed"
                )}
              />
            </div>

            <div>
              <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider block mb-2.5">
                Chains
              </label>
              <div className="flex gap-2">
                <label
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all",
                    spSolana
                      ? "bg-brand-subtle border-brand/25 text-white"
                      : "bg-surface-raised border-surface-border text-gray-500"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={spSolana}
                    onChange={(e) => setSpSolana(e.target.checked)}
                    disabled={loading}
                    className="sr-only"
                  />
                  Solana
                </label>
                <label
                  className={cn(
                    "flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-semibold border cursor-pointer transition-all",
                    spEvm
                      ? "bg-brand-subtle border-brand/25 text-white"
                      : "bg-surface-raised border-surface-border text-gray-500"
                  )}
                >
                  <input
                    type="checkbox"
                    checked={spEvm}
                    onChange={(e) => setSpEvm(e.target.checked)}
                    disabled={loading}
                    className="sr-only"
                  />
                  EVM
                </label>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className={cn(
                "w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all",
                loading
                  ? "bg-brand/50 text-white/70 cursor-not-allowed"
                  : "bg-brand text-white hover:bg-brand-dark shadow-lg shadow-brand-glow active:scale-[0.98]"
              )}
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  Import Wallet
                </>
              )}
            </button>
          </form>
        )}
      </div>

      {/* Security note */}
      <div className="px-5 py-2.5 border-t border-surface-border">
        <p className="text-[10px] text-gray-600 text-center">
          Keys are encrypted locally before being sent to Turnkey's secure enclaves
        </p>
      </div>
    </div>
  );
}

import { useState } from "react";
import { ArrowLeft, Plus, AlertCircle, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { error as logError } from "@/lib/log";
import { getTurnkeyClient, createWallet } from "@/lib/turnkey";
import type { TurnkeySession } from "@/lib/types";

interface CreateWalletProps {
  session: TurnkeySession;
  onBack: () => void;
  onCreated: () => void;
}

export function CreateWallet({ session, onBack, onCreated }: CreateWalletProps) {
  const [name, setName] = useState("");
  const [solana, setSolana] = useState(true);
  const [evm, setEvm] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError("Wallet name is required");
      return;
    }
    if (!solana && !evm) {
      setError("Select at least one chain");
      return;
    }

    setLoading(true);
    setError("");
    try {
      const chains: ("solana" | "evm")[] = [];
      if (solana) chains.push("solana");
      if (evm) chains.push("evm");

      const client = getTurnkeyClient(session);
      await createWallet(client, name.trim(), chains);
      onCreated();
    } catch (err) {
      logError("Create wallet error:", err);
      setError(err instanceof Error ? err.message : "Failed to create wallet");
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
        <h2 className="text-sm font-bold text-white">Create Wallet</h2>
      </div>

      {error && (
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/15">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-400">{error}</span>
          </div>
        </div>
      )}

      <form onSubmit={handleCreate} className="px-5 pb-5 flex flex-col gap-5">
        {/* Name */}
        <div>
          <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider block mb-2">
            Wallet Name
          </label>
          <input
            type="text"
            placeholder="e.g. Trading Wallet"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            className={cn(
              "w-full bg-surface-raised border border-surface-border rounded-xl px-4 py-3.5 text-sm text-gray-200 placeholder-gray-600",
              "focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/15 focus:bg-surface-overlay transition-all",
              loading && "opacity-50 cursor-not-allowed"
            )}
          />
        </div>

        {/* Chain Selection */}
        <div>
          <label className="text-[11px] text-gray-400 font-semibold uppercase tracking-wider block mb-2.5">
            Chains
          </label>
          <div className="flex flex-col gap-2">
            <ChainCheckbox
              label="Solana"
              checked={solana}
              onChange={setSolana}
              disabled={loading}
            />
            <ChainCheckbox
              label="Ethereum (EVM)"
              checked={evm}
              onChange={setEvm}
              disabled={loading}
            />
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
              <Plus className="w-4 h-4" />
              Create Wallet
            </>
          )}
        </button>
      </form>
    </div>
  );
}

function ChainCheckbox({
  label,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled: boolean;
}) {
  return (
    <label
      className={cn(
        "flex items-center gap-3 px-4 py-3.5 rounded-xl border cursor-pointer transition-all",
        checked
          ? "bg-brand-subtle border-brand/25"
          : "bg-surface-raised border-surface-border hover:border-surface-border-light",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        disabled={disabled}
        className="sr-only"
      />
      <div
        className={cn(
          "w-4.5 h-4.5 rounded flex items-center justify-center transition-all border",
          checked
            ? "bg-brand border-brand"
            : "border-gray-600 bg-transparent"
        )}
      >
        {checked && <Check className="w-3 h-3 text-white" />}
      </div>
      <span className={cn("text-sm font-medium", checked ? "text-white" : "text-gray-400")}>{label}</span>
    </label>
  );
}

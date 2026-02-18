import { useState, useEffect } from "react";
import { Plus, X, AlertCircle, Check, ExternalLink, Info, Radar } from "lucide-react";
import { cn } from "@/lib/utils";
import { error as logError } from "@/lib/log";
import {
  apiGetTrackedAccounts,
  apiAddTrackedAccount,
  apiRemoveTrackedAccount,
} from "@/lib/api";
import type { TrackedAccount } from "@/lib/types";

export function TrackerManager() {
  const [accounts, setAccounts] = useState<TrackedAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [username, setUsername] = useState("");
  const [adding, setAdding] = useState(false);
  const [success, setSuccess] = useState("");
  const [removingId, setRemovingId] = useState<string | null>(null);

  useEffect(() => {
    loadAccounts();
  }, []);

  async function loadAccounts() {
    setLoading(true);
    setError("");
    try {
      const { accounts: accs } = await apiGetTrackedAccounts();
      setAccounts(accs);
    } catch (err) {
      logError("Failed to load tracked accounts:", err);
      setError("Failed to load tracked accounts.");
    } finally {
      setLoading(false);
    }
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const handle = username.replace(/^@/, "").trim();
    if (!handle) {
      setError("Enter a Twitter username");
      return;
    }

    setAdding(true);
    setError("");
    setSuccess("");
    try {
      const { account } = await apiAddTrackedAccount(handle);
      setAccounts((prev) => [account, ...prev]);
      setUsername("");
      setSuccess(`@${account.twitterUsername} added`);
      setTimeout(() => setSuccess(""), 2000);
    } catch (err) {
      logError("Failed to add account:", err);
      setError(err instanceof Error ? err.message : "Failed to add account");
    } finally {
      setAdding(false);
    }
  }

  async function handleRemove(twitterId: string) {
    setRemovingId(twitterId);
    setError("");
    try {
      await apiRemoveTrackedAccount(twitterId);
      setAccounts((prev) => prev.filter((a) => a.twitterId !== twitterId));
    } catch (err) {
      logError("Failed to remove account:", err);
      setError(err instanceof Error ? err.message : "Failed to remove account");
    } finally {
      setRemovingId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Add Account */}
      <form onSubmit={handleAdd} className="px-5">
        <div className="flex items-center gap-2 mb-2.5">
          <label className="text-[10px] text-muted-foreground font-semibold uppercase tracking-wider">
            Track Twitter Account
          </label>
          <div className="relative group">
            <Info className="w-3 h-3 text-muted-foreground/40 cursor-help" />
            <div
              className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-52 px-3 py-2 rounded-xl text-[10px] text-foreground/70 leading-relaxed opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-30 pointer-events-none"
              style={{ background: "hsl(0 0% 8%)", border: "1px solid hsl(0 0% 100% / 0.08)", boxShadow: "0 12px 40px hsl(0 0% 0% / 0.5)" }}
            >
              Track any Twitter account across all websites for free — no paywalls, no level requirements, no restrictions.
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            placeholder="@username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={adding}
            className={cn(
              "flex-1 rounded-xl px-4 py-2.5 text-sm text-foreground placeholder-muted-foreground/40 font-mono",
              "focus:outline-none focus:ring-1 focus:ring-primary/30 transition-all",
              adding && "opacity-50 cursor-not-allowed"
            )}
            style={{
              background: "hsl(0 0% 100% / 0.03)",
              border: "1px solid hsl(0 0% 100% / 0.06)",
            }}
          />
          <button
            type="submit"
            disabled={adding}
            className={cn(
              "px-4 py-2.5 rounded-xl text-xs font-semibold flex items-center gap-2 transition-all",
              adding
                ? "bg-primary/50 text-foreground/70 cursor-not-allowed"
                : "bg-primary text-primary-foreground glow-blue glow-blue-hover"
            )}
          >
            {adding ? (
              <div className="w-3.5 h-3.5 border-2 border-foreground/30 border-t-foreground rounded-full animate-spin" />
            ) : (
              <Plus className="w-3.5 h-3.5" />
            )}
            Add
          </button>
        </div>
      </form>

      {/* Messages */}
      {error && (
        <div className="px-5">
          <div
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
            style={{ background: "hsl(0 84% 60% / 0.08)", border: "1px solid hsl(0 84% 60% / 0.15)" }}
          >
            <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
            <span className="text-xs text-destructive">{error}</span>
          </div>
        </div>
      )}
      {success && (
        <div className="px-5">
          <div
            className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
            style={{ background: "hsl(152 100% 38% / 0.08)", border: "1px solid hsl(152 100% 38% / 0.15)" }}
          >
            <Check className="w-4 h-4 text-accent flex-shrink-0" />
            <span className="text-xs text-accent">{success}</span>
          </div>
        </div>
      )}

      {/* Account List */}
      <div className="px-5 flex-1 overflow-y-auto max-h-[280px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-10 gap-3">
            <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Loading accounts...</p>
          </div>
        ) : accounts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 gap-2.5">
            <div className="w-10 h-10 rounded-xl glass-subtle flex items-center justify-center">
              <Radar className="w-5 h-5 text-muted-foreground/40" />
            </div>
            <p className="text-xs text-muted-foreground">No tracked accounts yet</p>
            <p className="text-[10px] text-muted-foreground/50">Add a Twitter handle above to start tracking</p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {accounts.map((account) => (
              <div
                key={account.id}
                className="rounded-xl px-4 py-3 flex items-center justify-between glass-subtle hover:border-primary/25 transition-all group"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-muted/60 border border-border/40 group-hover:border-primary/25 transition-all shrink-0">
                    <span className="text-[11px] font-bold text-muted-foreground group-hover:text-foreground transition-colors">
                      {account.twitterUsername.charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <span className="text-[13px] font-semibold text-foreground/70 group-hover:text-foreground transition-colors truncate font-mono">
                    @{account.twitterUsername}
                  </span>
                  <a
                    href={`https://x.com/${account.twitterUsername}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-muted-foreground/30 hover:text-primary transition-colors shrink-0"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <ExternalLink className="w-3 h-3" />
                  </a>
                </div>
                <button
                  onClick={() => handleRemove(account.twitterId)}
                  disabled={removingId === account.twitterId}
                  className="text-muted-foreground/30 hover:text-destructive transition-colors p-1 rounded-md hover:bg-destructive/10 shrink-0"
                >
                  {removingId === account.twitterId ? (
                    <div className="w-3.5 h-3.5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
                  ) : (
                    <X className="w-3.5 h-3.5" />
                  )}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

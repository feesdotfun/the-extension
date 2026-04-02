import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Shield,
  ShieldCheck,
  Globe,
  Eye,
  LogOut,
  Copy,
  Check,
  Info,
  Crown,
  Loader2,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { VERSION, BUILD_ID } from "@/lib/buildInfo";
import { PLATFORMS } from "@/lib/platforms";
import type { DeployerConfig } from "@/lib/platforms";
import type { AuthUser, Wallet } from "@/lib/types";
import { getExtensionSettings, setExtensionSettings } from "@/lib/storage";
import type { ExtensionSettings } from "@/lib/storage";
import { SERVERS, DEV_SERVER, pingServer, apiGetSubscription } from "@/lib/api";
import type { ServerId, SubscriptionStatus } from "@/lib/api";
import { getServerSelection, setServerSelection } from "@/lib/storage";
import { PremiumModal } from "./PremiumModal";

function PremiumSection({ wallets, onPremiumChange }: { wallets: Wallet[]; onPremiumChange: (active: boolean) => void }) {
  const [sub, setSub] = useState<SubscriptionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    apiGetSubscription().then((s) => { setSub(s); if (s?.active) onPremiumChange(true); }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <section className="rounded-xl glass-subtle p-4">
        <div className="flex items-center gap-2">
          <Crown className="w-4 h-4 text-amber-400" />
          <h2 className="text-[13px] font-semibold text-foreground">Premium</h2>
        </div>
        <div className="flex justify-center py-3">
          <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        </div>
      </section>
    );
  }

  const isActive = sub?.active;

  return (
    <>
      <section className="rounded-xl glass-subtle p-4">
        <div className="flex items-center gap-2 mb-3">
          <Crown className={cn("w-4 h-4", isActive ? "text-amber-400" : "text-muted-foreground")} />
          <h2 className="text-[13px] font-semibold text-foreground">Premium</h2>
          {isActive && (
            <span className="ml-auto text-[10px] font-medium text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded-full">
              Active
            </span>
          )}
        </div>

        {isActive ? (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Current Fee</span>
              <span className="text-[12px] font-medium text-amber-400 font-mono">{sub.feePercent}%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Expires</span>
              <span className="text-[12px] font-medium text-foreground font-mono">
                {sub.daysRemaining}d remaining
              </span>
            </div>
            <div className="bg-amber-400/5 border border-amber-400/15 rounded-lg px-3 py-2 mt-2">
              <div className="flex items-center gap-2">
                <Zap className="w-3 h-3 text-amber-400 flex-shrink-0" />
                <span className="text-[11px] text-amber-400/80">
                  thanks for supporting us!
                </span>
              </div>
            </div>
            <button
              onClick={() => setModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-[11px] font-semibold bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 transition-all border border-amber-400/15"
            >
              <Crown className="w-3 h-3" />
              Extend Subscription
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Current Fee</span>
              <span className="text-[12px] font-medium text-foreground font-mono">0.35%</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Premium Fee</span>
              <span className="text-[12px] font-medium text-amber-400 font-mono">0.25%</span>
            </div>

            <button
              onClick={() => setModalOpen(true)}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-[12px] font-semibold transition-all bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:from-amber-400 hover:to-amber-300 shadow-lg shadow-amber-500/20"
            >
              <Crown className="w-3.5 h-3.5" />
              Go Premium — $100/mo
            </button>

            <p className="text-[10px] text-muted-foreground text-center">
              30 days of 0.25% fees. Support development & save on every trade.
            </p>
          </div>
        )}
      </section>

      <PremiumModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        wallets={wallets}
        onActivated={(result) => { setSub(result); onPremiumChange(true); }}
      />
    </>
  );
}

const isDev = import.meta.env.DEV || import.meta.env.MODE === "development";

const allServers = isDev ? [DEV_SERVER, ...SERVERS] : [...SERVERS];

interface Props {
  user: AuthUser;
  wallets: Wallet[];
  deployerConfig: DeployerConfig;
  onDeployerConfigChange: (config: DeployerConfig) => void;
  onBack: () => void;
  onLogout: () => void;
}

function Toggle({ enabled, onChange, disabled }: { enabled: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button
      onClick={() => !disabled && onChange(!enabled)}
      className={cn(
        "relative w-9 h-5 rounded-full transition-colors flex-shrink-0",
        enabled ? "bg-brand" : "bg-surface-border",
        disabled && "opacity-50 cursor-not-allowed"
      )}
    >
      <span
        className={cn(
          "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-transform shadow-sm",
          enabled && "translate-x-4"
        )}
      />
    </button>
  );
}

export function SettingsView({ user, wallets, deployerConfig, onDeployerConfigChange, onBack, onLogout }: Props) {
  const [settings, setSettings] = useState<ExtensionSettings>({ localSigning: false, watermarksEnabled: true });
  const [isPremium, setIsPremium] = useState(false);
  const [copiedRef, setCopiedRef] = useState(false);
  const [selectedServer, setSelectedServer] = useState<ServerId>("auto");
  const [pings, setPings] = useState<Record<string, number | null>>({});
  const [pinging, setPinging] = useState(false);

  // Load settings
  useEffect(() => {
    getExtensionSettings().then(setSettings);
    getServerSelection().then((saved) => {
      if (saved) setSelectedServer(saved.serverId);
      else if (isDev) setSelectedServer("dev");
    });
  }, []);

  // Ping servers on mount
  const pingAll = useCallback(async () => {
    setPinging(true);
    const results: Record<string, number | null> = {};
    await Promise.allSettled(
      allServers.map(async (s) => {
        try { results[s.id] = await pingServer(s.httpUrl); } catch { results[s.id] = null; }
      })
    );
    setPings(results);
    setPinging(false);
  }, []);

  useEffect(() => { pingAll(); }, [pingAll]);

  const updateSetting = async (key: keyof ExtensionSettings, value: boolean) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    await setExtensionSettings({ [key]: value });
  };

  const handleServerSelect = async (id: ServerId) => {
    setSelectedServer(id);
    let server;
    if (id === "auto") {
      let best = allServers[0];
      let bestMs = Infinity;
      for (const s of allServers) {
        const ms = pings[s.id];
        if (ms !== null && ms !== undefined && ms < bestMs) { bestMs = ms; best = s; }
      }
      server = best;
    } else {
      server = allServers.find((s) => s.id === id) || allServers[0];
    }
    await setServerSelection({ serverId: id, wsUrl: server.wsUrl, httpUrl: server.httpUrl });
  };

  const handleCopyReferral = () => {
    if (user.referralCode?.code) {
      navigator.clipboard.writeText(user.referralCode.code);
      setCopiedRef(true);
      setTimeout(() => setCopiedRef(false), 2000);
    }
  };

  const handlePlatformWallet = (platformId: string, walletAddress: string | undefined) => {
    const updated = { ...deployerConfig, [platformId]: walletAddress };
    if (!walletAddress) delete updated[platformId as keyof typeof updated];
    onDeployerConfigChange(updated); // WalletManager persists this
  };

  // Get Solana wallets for platform assignment dropdown
  const solanaWallets = wallets.flatMap((w) =>
    w.accounts
      .filter((a) => a.addressFormat === "ADDRESS_FORMAT_COMPRESSED" || a.path?.includes("501"))
      .map((a) => ({ name: w.walletName, address: a.address }))
  );

  return (
    <motion.div
      initial={{ x: "100%" }}
      animate={{ x: 0 }}
      exit={{ x: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="bg-background h-[600px] flex flex-col overflow-hidden"
    >
      {/* Header */}
      <div className="px-5 pt-5 pb-3 flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-8 h-8 rounded-lg flex items-center justify-center glass-subtle text-muted-foreground hover:text-foreground transition-all"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <h1 className="text-base font-bold text-foreground font-display tracking-tight">Settings</h1>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">

        {/* ── Security & Signing ── */}
        <section className="rounded-xl glass-subtle p-4">
          <div className="flex items-center gap-2 mb-3">
            {settings.localSigning ? (
              <ShieldCheck className="w-4 h-4 text-accent" />
            ) : (
              <Shield className="w-4 h-4 text-muted-foreground" />
            )}
            <h2 className="text-[13px] font-semibold text-foreground">Security & Signing</h2>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-[12px] font-medium text-foreground mb-0.5">Local Signing</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Sign transactions on your device. Private keys never leave your machine.
              </p>
            </div>
            <Toggle enabled={settings.localSigning} onChange={(v) => updateSetting("localSigning", v)} />
          </div>

          {settings.localSigning && (
            <div className="mt-3 bg-accent/5 border border-accent/15 rounded-lg px-3 py-2.5 space-y-1.5">
              {[
                "Keys stay encrypted on your device",
                "Backend only builds transactions",
                "You sign & submit locally",
              ].map((text) => (
                <div key={text} className="flex items-center gap-2">
                  <Check className="w-3 h-3 text-accent flex-shrink-0" />
                  <span className="text-[11px] text-accent/80">{text}</span>
                </div>
              ))}
            </div>
          )}
        </section>

      {/* ── Display ── */}
      <section className="rounded-xl glass-subtle p-4">
          <div className="flex items-center gap-2 mb-3">
            <Eye className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-semibold text-foreground">Display</h2>
          </div>

          <div className="flex items-start justify-between gap-3">
            <div className="flex-1">
              <p className="text-[12px] font-medium text-foreground mb-0.5">Site Watermarks</p>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Show fees.fun branding on intercepted sites.
              </p>
            </div>
            <Toggle enabled={settings.watermarksEnabled} onChange={(v) => updateSetting("watermarksEnabled", v)} />
          </div>
        </section>

        {/* ── Server ── */}
        <section className="rounded-xl glass-subtle p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Globe className="w-4 h-4 text-muted-foreground" />
              <h2 className="text-[13px] font-semibold text-foreground">Server</h2>
            </div>
            <button
              onClick={pingAll}
              className={cn("text-[10px] text-muted-foreground hover:text-foreground transition-colors", pinging && "animate-pulse")}
            >
              {pinging ? "Pinging..." : "Refresh"}
            </button>
          </div>

          <div className="space-y-1">
            {/* Auto option */}
            <button
              onClick={() => handleServerSelect("auto")}
              className={cn(
                "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left",
                selectedServer === "auto" ? "bg-brand/10 border border-brand/20" : "hover:bg-surface-overlay border border-transparent"
              )}
            >
              <span className={cn("w-2 h-2 rounded-full", selectedServer === "auto" ? "bg-brand" : "bg-surface-border")} />
              <span className={cn("text-[12px] font-medium flex-1", selectedServer === "auto" ? "text-brand-light" : "text-gray-400")}>
                Auto (Best)
              </span>
            </button>

            {allServers.map((s) => {
              const ms = pings[s.id] ?? null;
              const isSelected = selectedServer === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => handleServerSelect(s.id as ServerId)}
                  className={cn(
                    "w-full flex items-center gap-2.5 px-3 py-2 rounded-lg transition-colors text-left",
                    isSelected ? "bg-brand/10 border border-brand/20" : "hover:bg-surface-overlay border border-transparent"
                  )}
                >
                  <span className={cn("w-2 h-2 rounded-full",
                    ms === null ? "bg-gray-500" : ms < 100 ? "bg-emerald-400" : ms < 300 ? "bg-brand-light" : "bg-amber-400"
                  )} />
                  <span className={cn("text-[12px] font-medium flex-1", isSelected ? "text-brand-light" : "text-gray-300")}>
                    {s.label}
                  </span>
                  <span className={cn("text-[10px] font-mono tabular-nums",
                    ms === null ? "text-gray-500" : ms < 100 ? "text-emerald-400" : ms < 300 ? "text-brand-light" : "text-amber-400"
                  )}>
                    {ms !== null ? `${ms}ms` : "---"}
                  </span>
                </button>
              );
            })}
          </div>
        </section>


        {/* ── Platforms ── */}
        <section className="rounded-xl glass-subtle p-4">
          <div className="flex items-center gap-2 mb-3">
            <img src="/icons/feesfun.png" alt="" className="w-4 h-4 rounded" />
            <h2 className="text-[13px] font-semibold text-foreground">Platforms</h2>
          </div>

          <div className="space-y-2.5">
            {PLATFORMS.map((platform) => {
              if (platform.alwaysActive) {
                return (
                  <div key={platform.id} className="flex items-center gap-3 px-1">
                    <img src={platform.logo} alt="" className="w-5 h-5 rounded" />
                    <span className="text-[12px] text-gray-300 flex-1">{platform.name}</span>
                    <span className="text-[10px] text-muted-foreground">Always active</span>
                  </div>
                );
              }

              const assigned = deployerConfig[platform.id];
              const assignedWallet = solanaWallets.find((w) => w.address === assigned);

              return (
                <div key={platform.id} className="flex items-center gap-3 px-1">
                  <img src={platform.logo} alt="" className="w-5 h-5 rounded" />
                  <span className="text-[12px] text-gray-300 flex-1">{platform.name}</span>
                  <select
                    value={assigned || ""}
                    onChange={(e) => handlePlatformWallet(platform.id, e.target.value || undefined)}
                    className="text-[11px] bg-surface-raised border border-surface-border rounded-lg px-2 py-1 text-foreground max-w-[120px] truncate appearance-none cursor-pointer"
                  >
                    <option value="">None</option>
                    {solanaWallets.map((w) => (
                      <option key={w.address} value={w.address}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </div>
        </section>

        {/* ── Premium ── */}
        <PremiumSection wallets={wallets} onPremiumChange={setIsPremium} />

        {/* ── Account ── */}
        <section className="rounded-xl glass-subtle p-4">
          <div className="flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-muted-foreground" />
            <h2 className="text-[13px] font-semibold text-foreground">Account</h2>
          </div>

          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Username</span>
              <span className="text-[12px] text-foreground font-medium font-mono">{user.username}</span>
            </div>

            {user.referralCode && (
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Referral Code</span>
                <button
                  onClick={handleCopyReferral}
                  className="flex items-center gap-1.5 text-[12px] text-brand-light font-medium font-mono hover:text-foreground transition-colors"
                >
                  {user.referralCode.code}
                  {copiedRef ? <Check className="w-3 h-3 text-accent" /> : <Copy className="w-3 h-3" />}
                </button>
              </div>
            )}

            <div className="pt-1.5">
              <button
                onClick={onLogout}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-surface-border hover:border-destructive/30 hover:bg-destructive/5 text-muted-foreground hover:text-destructive transition-all text-[12px] font-medium"
              >
                <LogOut className="w-3.5 h-3.5" />
                Log Out
              </button>
            </div>
          </div>
        </section>

        {/* ── About ── */}
        <section className="rounded-xl glass-subtle px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <img src="/icons/feesfun.png" alt="" className="w-4 h-4 rounded" />
              <span className="text-[12px] font-medium text-foreground">fees.fun</span>
              <span className="text-[10px] text-muted-foreground font-mono">{VERSION}</span>
            </div>
            <div className="flex items-center gap-2.5">
              {[
                { label: "Discord", url: "https://discord.gg/feesdotfun" },
                { label: "Docs", url: "https://docs.fees.fun" },
                { label: "Twitter", url: "https://x.com/feesdottfun" },
              ].map((link) => (
                <a
                  key={link.label}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </section>

      </div>
    </motion.div>
  );
}

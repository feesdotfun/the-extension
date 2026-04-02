import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Wallet as WalletIcon,
  Radar,
  TrendingDown,
  Settings,
  ChevronRight,
  Plus,
  Download,
  Copy,
  Check,
  ChefHat,
  RefreshCw,
  AlertCircle,
  ArrowDownRight,
  Globe,
  X,
  Zap,
  Crown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { error as logError } from "@/lib/log";
import { getTurnkeySession, getDeployerConfig, setDeployerConfig, setTurnkeySession, isPromoDismissed, setPromoDismissedAt } from "@/lib/storage";
import { getTurnkeyClient, listWallets, exportAccountKey } from "@/lib/turnkey";
import { syncCache, getUncachedAddresses, cacheWallet } from "@/lib/wallet-cache";
import { apiRefreshTurnkeySession, apiGetDeployerConfig, apiSetDeployerConfig, apiGetPromotions, apiGetSavings, apiGetSubscription } from "@/lib/api";
import type { PlatformSavings } from "@/lib/api";
import { getSolanaBalances, formatSol } from "@/lib/solana";
import { fetchSolPrice, formatUsd } from "@/lib/solPrice";
import { PLATFORMS } from "@/lib/platforms";
import type { DeployerConfig } from "@/lib/platforms";
import type { AuthUser, Wallet, TurnkeySession, Promotion } from "@/lib/types";
import { CreateWallet } from "./CreateWallet";
import { ImportWallet } from "./ImportWallet";
import { WalletDetail } from "./WalletDetail";
import { TrackerManager } from "./TrackerManager";
import { PingIndicator } from "./PingIndicator";
import { SettingsView } from "./SettingsView";

interface WalletManagerProps {
  user: AuthUser;
  onLogout: () => void;
}

type ActiveChain = "solana" | "evm";
type ActiveSection = "wallets" | "tracker" | "savings";

const SAVINGS_SPARKLES = [
  { top: "12%", left: "15%", delay: "0s", size: "4px" },
  { top: "20%", right: "18%", delay: "0.7s", size: "3px" },
  { top: "75%", left: "25%", delay: "1.2s", size: "3px" },
  { top: "65%", right: "12%", delay: "0.3s", size: "5px" },
  { top: "40%", left: "8%", delay: "1.8s", size: "2px" },
] as const;

function useCountUp(target: number, duration = 1500, startCounting = false) {
  const [value, setValue] = useState(0);
  const startTime = useRef<number | null>(null);

  useEffect(() => {
    if (!startCounting) return;
    startTime.current = null;
    const animate = (timestamp: number) => {
      if (!startTime.current) startTime.current = timestamp;
      const progress = Math.min((timestamp - startTime.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(eased * target);
      if (progress < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, [target, duration, startCounting]);

  return value;
}

export function WalletManager({ user, onLogout }: WalletManagerProps) {
  const [activeSection, setActiveSection] = useState<ActiveSection>("wallets");
  const [wallets, setWallets] = useState<Wallet[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [activeChain, setActiveChain] = useState<ActiveChain>("solana");
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [selectedWallet, setSelectedWallet] = useState<Wallet | null>(null);
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [session, setSession] = useState<TurnkeySession | null>(null);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [deployerConfig, setDeployerConfigState] = useState<DeployerConfig>({});
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [promoDismissed, setPromoDismissed] = useState(true);
  const [savingsData, setSavingsData] = useState<{ total: number; txCount: number; byPlatform: Record<string, PlatformSavings> } | null>(null);
  const [savingsLoading, setSavingsLoading] = useState(false);
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const [isPremium, setIsPremium] = useState(false);
  const balanceTimerRef = useRef<ReturnType<typeof setInterval>>();
  const cacheTimerRef = useRef<ReturnType<typeof setInterval>>();

  // CountUp animations for savings tab
  const savingsUsdTotal = savingsData && solPrice ? savingsData.total * solPrice : 0;
  const savingsUsd = useCountUp(savingsUsdTotal, 2000, activeSection === "savings" && !!savingsData);
  const savingsSol = useCountUp(savingsData?.total || 0, 2000, activeSection === "savings" && !!savingsData);
  const savingsTxCount = useCountUp(savingsData?.txCount || 0, 1800, activeSection === "savings" && !!savingsData);

  const cacheUncachedKeys = useCallback(async (w: Wallet[], s: TurnkeySession) => {
    try {
      const uncached = await getUncachedAddresses(w);
      if (uncached.length === 0) return;
      const client = getTurnkeyClient(s);
      for (const entry of uncached) {
        try {
          const key = await exportAccountKey(client, s, entry.address, {
            walletId: entry.walletId,
            walletName: entry.walletName,
            chain: entry.chain,
          });
          await cacheWallet(entry.address, key, {
            walletId: entry.walletId,
            walletName: entry.walletName,
            chain: entry.chain,
          });
        } catch {
          // Single key failed, continue with the rest
        }
      }
    } catch {
      // Cache check failed, will retry next interval
    }
  }, []);

  const fetchBalances = useCallback(async (w: Wallet[]) => {
    const solAddresses = w
      .flatMap((wallet) => wallet.accounts)
      .filter((a) => a.addressFormat === "ADDRESS_FORMAT_SOLANA")
      .map((a) => a.address);
    if (solAddresses.length === 0) return;
    try {
      const b = await getSolanaBalances(solAddresses);
      setBalances((prev) => ({ ...prev, ...b }));
    } catch (err) {
      logError("Failed to fetch balances:", err);
    }
  }, []);

  const loadDeployerConfig = useCallback(async (w: Wallet[]) => {
    let config = await getDeployerConfig();

    try {
      const { configs } = await apiGetDeployerConfig();
      config = configs;
      await setDeployerConfig(configs);
    } catch {
      // API unavailable -- use local cache
    }

    const firstSolAddress = w
      .flatMap((wallet) => wallet.accounts)
      .find((a) => a.addressFormat === "ADDRESS_FORMAT_SOLANA")?.address;

    if (firstSolAddress) {
      if (!config) config = {} as DeployerConfig;
      let updated = false;
      for (const p of PLATFORMS) {
        if (p.alwaysActive) continue; // Axiom doesn't need a deployer wallet
        if (!(config as Record<string, string>)[p.id]) {
          (config as Record<string, string>)[p.id] = firstSolAddress;
          updated = true;
        }
      }
      if (updated) {
        await setDeployerConfig(config);
        apiSetDeployerConfig(config).catch(() => {});
      }
    }

    if (config) setDeployerConfigState(config);
  }, []);

  const loadSavings = useCallback(async () => {
    setSavingsLoading(true);
    try {
      const data = await apiGetSavings();
      setSavingsData({ total: data.totalSavedSol, txCount: data.totalTransactions, byPlatform: data.byPlatform });
    } catch {
      // API unavailable
    } finally {
      setSavingsLoading(false);
    }
  }, []);

  const handleDeployerConfigChanged = useCallback(async (config: DeployerConfig) => {
    setDeployerConfigState(config);
    await setDeployerConfig(config);
    apiSetDeployerConfig(config).catch(() => {});
  }, []);

  useEffect(() => {
    loadWallets();
    loadSavings();
    fetchSolPrice().then(setSolPrice).catch(() => {});
    apiGetSubscription().then((s) => { if (s?.active) setIsPremium(true); }).catch(() => {});
    apiGetPromotions()
      .then(async ({ promotions }) => {
        if (promotions.length > 0) {
          setPromotion(promotions[0]);
          const dismissed = await isPromoDismissed();
          setPromoDismissed(dismissed);
        }
      })
      .catch(() => {});
    return () => {
      if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
      if (cacheTimerRef.current) clearInterval(cacheTimerRef.current);
    };
  }, []);

  async function getSession(): Promise<TurnkeySession> {
    let s = session ?? (await getTurnkeySession());
    if (!s) {
      const { turnkey } = await apiRefreshTurnkeySession();
      await setTurnkeySession(turnkey);
      s = turnkey;
    }
    setSession(s);
    return s;
  }

  async function loadWallets() {
    setLoading(true);
    setError("");
    try {
      const s = await getSession();
      const client = getTurnkeyClient(s);
      const w = await listWallets(client);
      setWallets(w);
      syncCache(w).catch(() => {});
      fetchBalances(w);
      loadDeployerConfig(w);
      if (balanceTimerRef.current) clearInterval(balanceTimerRef.current);
      balanceTimerRef.current = setInterval(() => fetchBalances(w), 5000);
      cacheUncachedKeys(w, s);
      if (cacheTimerRef.current) clearInterval(cacheTimerRef.current);
      cacheTimerRef.current = setInterval(() => cacheUncachedKeys(w, s), 5000);
    } catch (err) {
      logError("Failed to load wallets:", err);
      setError("Failed to load wallets. Try refreshing.");
    } finally {
      setLoading(false);
    }
  }

  function handleCopy(address: string) {
    navigator.clipboard.writeText(address);
    setCopiedAddress(address);
    setTimeout(() => setCopiedAddress(null), 2000);
  }

  function truncateAddress(addr: string) {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
  }

  function getFilteredWallets(): Wallet[] {
    const format =
      activeChain === "solana"
        ? "ADDRESS_FORMAT_SOLANA"
        : "ADDRESS_FORMAT_ETHEREUM";

    return wallets
      .map((w) => ({
        ...w,
        accounts: w.accounts.filter((a) => a.addressFormat === format),
      }))
      .filter((w) => w.accounts.length > 0)
      .sort((a, b) => {
        const tA = typeof a.createdAt === "string" ? a.createdAt : String(a.createdAt ?? "0");
        const tB = typeof b.createdAt === "string" ? b.createdAt : String(b.createdAt ?? "0");
        return tA < tB ? -1 : tA > tB ? 1 : 0;
      });
  }

  // Sub-page renders
  if (showSettings) {
    return (
      <SettingsView
        user={user}
        wallets={wallets}
        deployerConfig={deployerConfig}
        onDeployerConfigChange={handleDeployerConfigChanged}
        onBack={() => setShowSettings(false)}
        onLogout={onLogout}
      />
    );
  }

  if (showCreate && session) {
    return (
      <CreateWallet
        session={session}
        onBack={() => setShowCreate(false)}
        onCreated={() => {
          setShowCreate(false);
          loadWallets();
        }}
      />
    );
  }

  if (showImport && session) {
    return (
      <ImportWallet
        session={session}
        onBack={() => setShowImport(false)}
        onImported={() => {
          setShowImport(false);
          loadWallets();
        }}
      />
    );
  }

  if (selectedWallet && session) {
    return (
      <WalletDetail
        wallet={selectedWallet}
        session={session}
        deployerConfig={deployerConfig}
        onBack={() => setSelectedWallet(null)}
        onRenamed={() => {
          setSelectedWallet(null);
          loadWallets();
        }}
        onDeployerConfigChanged={handleDeployerConfigChanged}
      />
    );
  }

  const filtered = getFilteredWallets();
  const deployerAddresses = new Set(Object.values(deployerConfig));

  // Platforms that are active (assigned a deployer wallet, or always-active like Axiom)
  const activePlatforms = PLATFORMS.filter((platform) => {
    if (platform.alwaysActive) return true;
    const assignedAddress = deployerConfig[platform.id as keyof DeployerConfig];
    return !!assignedAddress && wallets.some((w) =>
      w.accounts.some((a) => a.address === assignedAddress)
    );
  });

  return (
    <div className="flex flex-col h-[600px] overflow-hidden relative">
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
      <div className="px-5 pt-4 pb-3 shrink-0 relative z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative">
              <img
                src="/icons/feesfun.png"
                alt="fees.fun"
                className="w-10 h-10 rounded-xl relative z-10"
              />
              <div
                className="absolute inset-0 rounded-xl blur-md"
                style={{ background: "hsl(213 100% 50% / 0.3)" }}
              />
            </div>
            <div>
              <h1 className="text-base font-bold text-foreground tracking-tight font-display">
                Fees<span className="text-primary">.fun</span>
              </h1>
              {user.referralCode ? (
                isPremium ? (
                  <p className="text-[11px] font-mono font-bold truncate max-w-[160px]" style={{ background: "linear-gradient(135deg, #f6d365, #fda085, #f6d365)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                    @{user.referralCode.code}
                  </p>
                ) : (
                  <p className="text-[11px] text-muted-foreground font-mono font-medium truncate max-w-[160px]">
                    @{user.referralCode.code}
                  </p>
                )
              ) : (
                <p className="text-[11px] text-muted-foreground font-medium truncate max-w-[160px]">
                  {user.username.split("_")[0]}
                </p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Active platforms pill */}
            {activePlatforms.length > 0 && (
              <div className="flex items-center gap-2.5 px-2.5 py-1.5 rounded-xl glass-subtle">
                {activePlatforms.map((platform) => (
                  <div key={platform.id} className="relative group cursor-pointer">
                    <img src={platform.logo} alt={platform.name} className="w-[18px] h-[18px] rounded-[5px]" />
                    <div
                      className="absolute -top-0.5 -right-0.5 w-[7px] h-[7px] rounded-full bg-accent z-10"
                      style={{ border: "1.5px solid hsl(var(--background))", boxShadow: "0 0 4px hsl(152 100% 38% / 0.6)" }}
                    />
                    <div
                      className="absolute -top-7 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded text-[8px] font-semibold text-foreground whitespace-nowrap opacity-0 group-hover:opacity-100 transition-all pointer-events-none z-20"
                      style={{ background: "hsl(0 0% 12%)", border: "1px solid hsl(0 0% 100% / 0.1)" }}
                    >
                      {platform.name}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button
              onClick={() => setShowSettings(true)}
              className="w-9 h-9 rounded-xl flex items-center justify-center glass-subtle text-muted-foreground hover:text-foreground transition-all"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Promotion banner */}
      {promotion && !promoDismissed && (
        <div className="px-5 pb-3 relative z-10">
          <div
            className="relative flex items-center gap-3 px-4 py-2.5 rounded-xl glass-subtle"
            style={{ borderColor: "hsl(213 100% 50% / 0.15)" }}
          >
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Zap className="w-3.5 h-3.5 text-primary flex-shrink-0" />
              <p className="text-[11px] text-muted-foreground truncate">
                <span className="font-semibold text-foreground">{promotion.feePercent}% fees</span>
                {" "}
                <span className="text-muted-foreground/50 line-through">{promotion.normalFee}%</span>
                {" "}
                <span className="text-muted-foreground">&#183; {promotion.durationDays}d {promotion.name}</span>
              </p>
            </div>
            <button
              onClick={() => { setPromoDismissed(true); setPromoDismissedAt(); }}
              className="flex-shrink-0 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
              aria-label="Dismiss promotion"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Tab bar */}
      <div className="px-5 pb-3 shrink-0 relative z-10">
        <div className="flex glass-subtle rounded-xl p-1 gap-1">
          {([
            { key: "wallets" as const, label: "Wallets", icon: WalletIcon },
            { key: "tracker" as const, label: "Tracker", icon: Radar },
            { key: "savings" as const, label: "Savings", icon: TrendingDown },
          ]).map((tab) => (
            <button
              key={tab.key}
              onClick={() => {
                setActiveSection(tab.key);
                if (tab.key === "savings" && !savingsData) loadSavings();
              }}
              className={cn(
                "flex-1 py-2.5 px-3 rounded-lg text-xs font-semibold flex items-center justify-center gap-2 transition-all relative",
                activeSection === tab.key
                  ? "text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {activeSection === tab.key && (
                <motion.div
                  layoutId="activeTab"
                  className="absolute inset-0 rounded-lg bg-primary glow-blue"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
              <span className="relative z-10 flex items-center gap-2">
                <tab.icon className="w-3.5 h-3.5" />
                {tab.label}
              </span>
              {tab.key === "savings" && savingsData && savingsData.total > 0 && solPrice && (
                <span
                  className="absolute -top-1.5 -right-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold font-mono leading-none z-20 text-accent"
                  style={{ background: "hsl(152 100% 38% / 0.12)", border: "1px solid hsl(152 100% 38% / 0.2)" }}
                >
                  {formatUsd(savingsData.total * solPrice)}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* ─── Wallets Tab ─── */}
      {activeSection === "wallets" ? (
        <>
          {/* Chain selector */}
          <div className="px-5 pb-3 shrink-0 relative z-10">
            <div className="flex gap-2">
              {(["solana", "evm"] as const).map((chain) => (
                <button
                  key={chain}
                  onClick={() => setActiveChain(chain)}
                  className={cn(
                    "flex-1 py-2 px-3 rounded-xl text-[11px] font-semibold transition-all relative overflow-hidden",
                    activeChain === chain
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  style={activeChain === chain
                    ? { background: "hsl(0 0% 100% / 0.04)", border: "1px solid hsl(0 0% 100% / 0.08)" }
                    : { background: "transparent", border: "1px solid hsl(0 0% 100% / 0.04)" }
                  }
                >
                  {activeChain === chain && <div className="absolute inset-0 shimmer" />}
                  <span className="relative z-10">{chain === "solana" ? "Solana" : "EVM"}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="px-5 pb-3 shrink-0 relative z-10">
              <div
                className="flex items-center gap-2.5 px-4 py-3 rounded-xl"
                style={{ background: "hsl(0 84% 60% / 0.08)", border: "1px solid hsl(0 84% 60% / 0.15)" }}
              >
                <AlertCircle className="w-4 h-4 text-destructive flex-shrink-0" />
                <span className="text-xs text-destructive flex-1">{error}</span>
                <button onClick={loadWallets} className="text-destructive hover:text-destructive/80 transition-colors">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}

          {/* Wallet list */}
          <div className="px-5 pb-2 flex-1 min-h-0 overflow-y-auto relative z-10">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-10 gap-3">
                <div className="w-6 h-6 border-2 border-primary/30 border-t-primary rounded-full animate-spin" />
                <p className="text-xs text-muted-foreground">Loading wallets...</p>
              </div>
            ) : filtered.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 gap-2">
                <div className="w-10 h-10 rounded-xl glass-subtle flex items-center justify-center">
                  <WalletIcon className="w-5 h-5 text-muted-foreground/40" />
                </div>
                <p className="text-xs text-muted-foreground">
                  No {activeChain === "solana" ? "Solana" : "EVM"} wallets found
                </p>
              </div>
            ) : (
              <div className="flex flex-col gap-2">
                <AnimatePresence>
                  {filtered.map((wallet, i) => {
                    const isDev = wallet.accounts.some(
                      (a) => a.addressFormat === "ADDRESS_FORMAT_SOLANA" && deployerAddresses.has(a.address)
                    );
                    return (
                      <motion.button
                        key={wallet.walletId}
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.08, duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                        onClick={() => {
                          const full = wallets.find((w) => w.walletId === wallet.walletId);
                          if (full) setSelectedWallet(full);
                        }}
                        className="w-full text-left rounded-xl px-4 py-3.5 transition-all group glass-subtle hover:border-primary/25"
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2.5">
                            <div
                              className={cn(
                                "w-8 h-8 rounded-lg flex items-center justify-center transition-all",
                                isDev
                                  ? "bg-primary/15 border border-primary/25 group-hover:border-primary/40"
                                  : "bg-muted/60 border border-border/40 group-hover:border-primary/25"
                              )}
                            >
                              {isDev ? (
                                <ChefHat className="w-4 h-4 text-primary" />
                              ) : (
                                <WalletIcon className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors" />
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <p className="text-[13px] font-semibold text-foreground/85 group-hover:text-foreground transition-colors">
                                {wallet.walletName}
                              </p>
                              {isDev && (
                                <span className="px-1.5 py-0.5 rounded-md text-[9px] font-bold text-primary bg-primary/10 border border-primary/20 leading-none">
                                  DEV
                                </span>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/40 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                        </div>
                        {wallet.accounts.map((account, j) => (
                          <div key={j} className="flex items-center justify-between gap-2 pl-[42px]">
                            <span className="text-[11px] text-muted-foreground/60 font-mono">
                              {truncateAddress(account.address)}
                            </span>
                            <div className="flex items-center gap-2">
                              <div
                                className="flex items-center gap-1.5 px-2 py-0.5 rounded-md"
                                style={{ background: "hsl(0 0% 100% / 0.03)" }}
                              >
                                <img src="/images/solana.png" alt="SOL" className="w-3 h-3" />
                                <span className="text-[10px] font-semibold text-foreground/60 font-mono">
                                  {balances[account.address] !== undefined
                                    ? formatSol(balances[account.address])
                                    : "..."}
                                </span>
                              </div>
                              <span
                                className="text-muted-foreground/40 hover:text-primary transition-colors p-1 rounded-md hover:bg-primary/10"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleCopy(account.address);
                                }}
                              >
                                {copiedAddress === account.address ? (
                                  <Check className="w-3 h-3 text-accent" />
                                ) : (
                                  <Copy className="w-3 h-3" />
                                )}
                              </span>
                            </div>
                          </div>
                        ))}
                      </motion.button>
                    );
                  })}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* Bottom actions */}
          <div
            className="px-5 py-3 flex gap-2.5 shrink-0 relative z-10"
            style={{ borderTop: "1px solid hsl(0 0% 100% / 0.04)" }}
          >
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowCreate(true)}
              disabled={!session && !loading}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all bg-primary text-primary-foreground glow-blue glow-blue-hover"
            >
              <Plus className="w-3.5 h-3.5" />
              Create
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowImport(true)}
              disabled={!session && !loading}
              className="flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all glass-subtle text-foreground/70 hover:text-foreground hover:border-primary/20"
            >
              <Download className="w-3.5 h-3.5" />
              Import
            </motion.button>
          </div>
        </>

      ) : activeSection === "tracker" ? (
        /* ─── Tracker Tab ─── */
        <div className="flex-1 min-h-0 overflow-y-auto relative z-10">
          <TrackerManager />
        </div>

      ) : (
        /* ─── Savings Tab ─── */
        <div className="px-5 pb-3 flex-1 min-h-0 overflow-y-auto relative z-10">
          {savingsLoading ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-6 h-6 border-2 border-accent/30 border-t-accent rounded-full animate-spin" />
              <p className="text-xs text-muted-foreground">Loading savings...</p>
            </div>
          ) : !savingsData || savingsData.txCount === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <div className="w-10 h-10 rounded-xl glass-subtle flex items-center justify-center">
                <TrendingDown className="w-5 h-5 text-muted-foreground/40" />
              </div>
              <p className="text-xs text-muted-foreground">No transactions yet</p>
              <p className="text-[10px] text-muted-foreground/50 text-center max-w-[200px]">
                Start using fees.fun to see how much you save on fees
              </p>
            </div>
          ) : (() => {
            // green for normal, gold for premium
            const c = isPremium
              ? { base: "45 100% 50%", light: "45 100% 55%", dark: "45 100% 42%", grad: "linear-gradient(90deg, hsl(40 100% 45%), hsl(45 100% 55%))" }
              : { base: "152 100% 38%", light: "152 100% 50%", dark: "152 100% 38%", grad: "linear-gradient(90deg, hsl(152 100% 38%), hsl(152 100% 50%))" };

            return (
            <div className="flex flex-col gap-3">
              {/* Hero savings card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="relative rounded-2xl overflow-hidden"
              >
                <div
                  className="absolute inset-0"
                  style={{ background: `linear-gradient(135deg, hsl(${c.base} / 0.08), hsl(213 100% 50% / 0.06))` }}
                />
                <div
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[200px] h-[200px] rounded-full blur-[60px]"
                  style={{ background: `hsl(${c.base} / 0.15)`, animation: "pulseSoft 3s ease-in-out infinite" }}
                />

                <div
                  className="absolute top-1/2 left-1/2 w-24 h-24 border rounded-full pointer-events-none"
                  style={{ borderColor: `hsl(${c.base} / 0.15)`, animation: "ringExpand 3s ease-out infinite" }}
                />
                <div
                  className="absolute top-1/2 left-1/2 w-24 h-24 border rounded-full pointer-events-none"
                  style={{ borderColor: `hsl(${c.base} / 0.1)`, animation: "ringExpand 3s ease-out infinite 1s" }}
                />

                {SAVINGS_SPARKLES.map((s, i) => (
                  <div
                    key={i}
                    className="absolute rounded-full pointer-events-none"
                    style={{
                      top: s.top,
                      left: "left" in s ? s.left : undefined,
                      right: "right" in s ? s.right : undefined,
                      width: s.size,
                      height: s.size,
                      background: `hsl(${c.light})`,
                      animation: `sparkle 2.5s ease-in-out infinite ${s.delay}`,
                      boxShadow: `0 0 6px hsl(${c.light} / 0.6)`,
                    }}
                  />
                ))}

                <div
                  className="relative p-6 text-center glass-subtle rounded-2xl"
                  style={{ borderColor: `hsl(${c.base} / 0.15)` }}
                >
                  <motion.p
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.2, duration: 0.5 }}
                    className="text-[10px] uppercase tracking-[0.25em] font-bold mb-3"
                    style={{ color: `hsl(${c.light} / 0.7)` }}
                  >
                    Total Saved
                  </motion.p>

                  <motion.div
                    initial={{ scale: 0.5, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.4, duration: 0.6, type: "spring", stiffness: 200 }}
                  >
                    <p
                      className="text-4xl font-bold tracking-tight leading-none font-display"
                      style={{
                        color: `hsl(${c.light})`,
                        textShadow: `0 0 30px hsl(${c.light} / 0.4), 0 0 60px hsl(${c.light} / 0.15)`,
                      }}
                    >
                      ${solPrice ? savingsUsd.toFixed(2) : (savingsSol * 150).toFixed(2)}
                    </p>
                    <p className="text-sm font-medium text-muted-foreground/50 mt-1.5 font-mono">
                      {savingsSol.toFixed(4)} SOL
                    </p>
                  </motion.div>

                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8, duration: 0.5 }}
                    className="flex items-center justify-center gap-2.5 mt-4"
                  >
                    <div
                      className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg"
                      style={{ background: `hsl(${c.base} / 0.1)`, border: `1px solid hsl(${c.base} / 0.15)` }}
                    >
                      <div
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ background: `hsl(${c.light})`, boxShadow: `0 0 6px hsl(${c.light} / 0.6)` }}
                      />
                      <span className="text-[10px] font-semibold font-mono" style={{ color: `hsl(${c.light})` }}>
                        {Math.round(savingsTxCount)} tx{savingsData.txCount !== 1 ? "s" : ""}
                      </span>
                    </div>
                    {savingsData.total > 0 && (
                      <div
                        className="flex items-center gap-1 px-2.5 py-1 rounded-lg"
                        style={{ background: `hsl(${c.base} / 0.1)`, border: `1px solid hsl(${c.base} / 0.15)` }}
                      >
                        <ArrowDownRight className="w-3 h-3" style={{ color: `hsl(${c.light})` }} />
                        <span className="text-[10px] font-semibold" style={{ color: `hsl(${c.light})` }}>
                          {(() => {
                            const totalPlatform = Object.values(savingsData.byPlatform).reduce((s, p) => s + p.platformFees, 0);
                            return totalPlatform > 0 ? ((savingsData.total / totalPlatform) * 100).toFixed(0) : "0";
                          })()}% less fees
                        </span>
                      </div>
                    )}
                  </motion.div>
                </div>
              </motion.div>

              {/* Platform breakdown */}
              <div className="flex flex-col gap-2">
                <p className="text-[10px] text-muted-foreground/50 font-semibold uppercase tracking-wider px-1">By Platform</p>
                {Object.entries(savingsData.byPlatform).map(([platformId, stats], i) => {
                  const platform = PLATFORMS.find((p) => p.id === platformId);
                  const savingsPercent = stats.platformFees > 0
                    ? ((stats.saved / stats.platformFees) * 100).toFixed(0)
                    : "0";
                  const barPercent = Math.min(100, Number(savingsPercent));
                  return (
                    <motion.div
                      key={platformId}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.6 + i * 0.12, duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                      className="glass-subtle rounded-xl px-4 py-3 transition-all group cursor-pointer"
                      whileHover={{ scale: 1.01 }}
                      style={{ borderColor: `hsl(${c.base} / 0.08)` }}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0 bg-muted/60 border border-border/40 group-hover:border-accent/25 transition-all">
                          {platform ? (
                            <img src={platform.logo} alt={platform.name} className="w-5 h-5 rounded-sm" />
                          ) : (
                            <Globe className="w-4 h-4 text-muted-foreground" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-xs font-semibold text-foreground/80 group-hover:text-foreground transition-colors">
                              {platform?.name || platformId}
                            </span>
                            <span className="text-xs font-bold font-mono" style={{ color: `hsl(${c.light})` }}>
                              {solPrice ? formatUsd(stats.saved * solPrice) : `${stats.saved.toFixed(4)} SOL`}
                            </span>
                          </div>
                          <div className="w-full h-1 rounded-full mb-1.5" style={{ background: "hsl(0 0% 100% / 0.04)" }}>
                            <motion.div
                              initial={{ width: "0%" }}
                              animate={{ width: `${barPercent}%` }}
                              transition={{ delay: 1 + i * 0.15, duration: 1.2, ease: [0.16, 1, 0.3, 1] }}
                              className="h-full rounded-full"
                              style={{
                                background: c.grad,
                                boxShadow: `0 0 8px hsl(${c.light} / 0.3)`,
                              }}
                            />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground/40 font-mono">
                              {stats.txCount} tx{stats.txCount !== 1 ? "s" : ""}
                            </span>
                            <div className="flex items-center gap-1">
                              <ArrowDownRight className="w-3 h-3" style={{ color: `hsl(${c.dark})` }} />
                              <span className="text-[10px] font-semibold" style={{ color: `hsl(${c.dark})` }}>
                                {savingsPercent}% less
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>

              {/* Premium upsell */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.5 }}
                className="rounded-xl p-4 mt-1"
                style={{
                  background: "linear-gradient(135deg, hsl(45 100% 50% / 0.06), hsl(35 100% 50% / 0.03))",
                  border: "1px solid hsl(45 100% 50% / 0.12)",
                }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <Crown className="w-4 h-4 text-amber-400" />
                  <span className="text-[12px] font-semibold text-amber-400">Want to save even more?</span>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">
                  Go Premium for $100/mo — drop your fees to <span className="text-amber-400 font-semibold">0.25%</span> and support development.
                </p>
                <button
                  onClick={() => setShowSettings(true)}
                  className="w-full py-2 rounded-lg text-[11px] font-semibold bg-amber-400/10 text-amber-400 hover:bg-amber-400/20 transition-all border border-amber-400/15"
                >
                  View Premium in Settings
                </button>
              </motion.div>
            </div>
          );
          })()}
        </div>
      )}

      {/* Footer */}
      <div
        className="px-4 py-2 shrink-0 flex items-center justify-between relative z-10"
        style={{ borderTop: "1px solid hsl(0 0% 100% / 0.04)" }}
      >
        <div className="flex items-center gap-1.5">
          <a
            href="https://discord.gg/feesdotfun"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-all"
            aria-label="Discord"
          >
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
            </svg>
          </a>
          <a
            href="https://x.com/feesdottfun"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center w-7 h-7 rounded-lg text-muted-foreground/50 hover:text-foreground hover:bg-muted/50 transition-all"
            aria-label="X (Twitter)"
          >
            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor">
              <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
            </svg>
          </a>
        </div>
        <PingIndicator />
      </div>
    </div>
  );
}

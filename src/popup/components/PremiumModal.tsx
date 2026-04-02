import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Crown, X, Wallet, QrCode, Loader2, Check, Copy } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiActivateSubscription } from "@/lib/api";
import type { SubscriptionStatus } from "@/lib/api";
import type { Wallet as WalletType } from "@/lib/types";
import {
  Connection,
  PublicKey,
  SystemProgram,
  Transaction,
  Keypair,
  LAMPORTS_PER_SOL,
} from "@solana/web3.js";
import bs58 from "bs58";
import { getCachedKey } from "@/lib/wallet-cache";
import { getAuthToken } from "@/lib/storage";

const PAYMENT_WALLET = "jewish4HqEexcZbhSQbLF42M963vyn1nNHFMWZhLhZV";
const API_BASE = import.meta.env.VITE_API_URL || "https://www.fees.fun";
const RPC_URL = "https://mainnet.helius-rpc.com/?api-key=2cc3c84d-bc8b-4efd-bc08-e5176f4bc2d1";

type PayMethod = "wallet" | "external" | null;

interface PaymentAddress {
  address: string;
  costSol: number;
  costUsd: number;
  solPrice: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  wallets: WalletType[];
  onActivated: (sub: SubscriptionStatus) => void;
  devForceSuccess?: boolean;
  devBypassPayment?: boolean;
}

async function fetchPaymentAddress(): Promise<PaymentAddress> {
  const token = await getAuthToken();
  const res = await fetch(`${API_BASE}/api/subscription/payment-address`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("failed to get payment address");
  return res.json();
}

export function PremiumModal({ open, onClose, wallets, onActivated, devForceSuccess, devBypassPayment }: Props) {
  const solanaWallets = wallets.flatMap((w) =>
    w.accounts
      .filter((a) => a.addressFormat === "ADDRESS_FORMAT_SOLANA" || a.addressFormat === "ADDRESS_FORMAT_COMPRESSED" || a.path?.includes("501"))
      .map((a) => ({ name: w.walletName, address: a.address }))
  );

  const [payment, setPayment] = useState<PaymentAddress | null>(null);
  const [method, setMethod] = useState<PayMethod>(null);
  const [selectedWallet, setSelectedWallet] = useState(solanaWallets[0]?.address ?? "");
  const [buying, setBuying] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(!!devForceSuccess);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (open) {
      setMethod(null);
      setError(null);
      setSuccess(!!devForceSuccess);
      if (devForceSuccess) return;
      if (devBypassPayment) {
        setPayment({ address: "DEVfake1111111111111111111111111111111111111", costSol: 0.69, costUsd: 100, solPrice: 144.93 });
      } else {
        setPayment(null);
        fetchPaymentAddress().then(setPayment).catch(() => {});
      }
    }
  }, [open]);

  const fakeResult: SubscriptionStatus = { active: true, expiresAt: new Date(Date.now() + 30 * 86400000).toISOString(), daysRemaining: 30, feePercent: 0.25 };

  const handleWalletPay = async () => {
    if (buying) return;
    setBuying(true);
    setError(null);

    try {
      if (devBypassPayment) {
        await new Promise((r) => setTimeout(r, 1500));
        setSuccess(true);
        onActivated(fakeResult);
        return;
      }

      if (!payment || !selectedWallet) throw new Error("missing wallet or price");
      const privateKey = await getCachedKey(selectedWallet);
      if (!privateKey) throw new Error("wallet key not cached — try again in a moment");

      const payer = Keypair.fromSecretKey(bs58.decode(privateKey));
      const connection = new Connection(RPC_URL, "confirmed");

      const lamports = Math.ceil(payment.costSol * LAMPORTS_PER_SOL);
      const tx = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: payer.publicKey,
          toPubkey: new PublicKey(PAYMENT_WALLET),
          lamports,
        })
      );

      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx.recentBlockhash = blockhash;
      tx.feePayer = payer.publicKey;
      tx.sign(payer);

      const sig = await connection.sendRawTransaction(tx.serialize(), { skipPreflight: false });
      await connection.confirmTransaction(sig, "confirmed");

      const result = await apiActivateSubscription(sig);
      setSuccess(true);
      onActivated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "payment failed");
    } finally {
      setBuying(false);
    }
  };

  const handleCheckPayment = async () => {
    if (checking) return;
    setChecking(true);
    setError(null);

    try {
      if (devBypassPayment) {
        await new Promise((r) => setTimeout(r, 1500));
        setSuccess(true);
        onActivated(fakeResult);
        return;
      }

      const result = await apiActivateSubscription("");
      setSuccess(true);
      onActivated(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "payment not found — try again in a moment");
    } finally {
      setChecking(false);
    }
  };

  const copyAddress = () => {
    if (!payment) return;
    navigator.clipboard.writeText(payment.address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!open) return null;

  const solanaUri = payment
    ? `solana:${payment.address}?amount=${payment.costSol}&label=fees.fun+Premium`
    : "";

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/90"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.2 }}
          className="w-[340px] max-h-[520px] overflow-y-auto rounded-2xl border border-surface-border bg-[#111113] shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          {/* header */}
          <div className="flex items-center justify-between p-4 pb-3">
            <div className="flex items-center gap-2">
              <Crown className="w-5 h-5 text-amber-400" />
              <h2 className="text-[14px] font-bold text-foreground">Go Premium</h2>
            </div>
            <button onClick={onClose} className="p-1 rounded-lg hover:bg-surface-overlay transition-colors">
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>

          {/* info */}
          <div className="px-4 pb-3">
            <div className="rounded-xl bg-amber-400/5 border border-amber-400/10 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Fee drops from</span>
                <span className="text-[12px] font-mono">
                  <span className="text-muted-foreground line-through">0.35%</span>
                  {" → "}
                  <span className="text-amber-400 font-semibold">0.25%</span>
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Duration</span>
                <span className="text-[12px] font-medium text-foreground">30 days</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-muted-foreground">Cost</span>
                <span className="text-[12px] font-semibold text-foreground font-mono">
                  {payment ? `${payment.costSol} SOL ($${payment.costUsd})` : "$100"}
                </span>
              </div>
            </div>
          </div>

          {success ? (
            <div className="px-4 pb-5">
              {/* confetti burst — particles fly outward from center */}
              <style>{`
                @keyframes confettiBurst {
                  0% { transform: translate(-50%, -50%) scale(0); opacity: 1; }
                  100% { transform: translate(var(--tx), var(--ty)) scale(1); opacity: 0; }
                }
                @keyframes confettiSpin {
                  0% { transform: rotate(0deg); }
                  100% { transform: rotate(var(--rot)); }
                }
              `}</style>
              <div className="relative">
                {Array.from({ length: 12 }).map((_, i) => {
                  const angle = (i / 12) * 360;
                  const distance = 80 + Math.random() * 60;
                  const tx = Math.cos(angle * Math.PI / 180) * distance;
                  const ty = Math.sin(angle * Math.PI / 180) * distance;
                  const colors = ["#f6d365", "#fda085", "#f093fb", "#4facfe", "#43e97b", "#fa709a", "#fee140"];
                  const color = colors[i % colors.length];
                  const size = 4 + Math.random() * 5;
                  const delay = Math.random() * 0.3;
                  const rot = (Math.random() > 0.5 ? 1 : -1) * (360 + Math.random() * 360);
                  return (
                    <div
                      key={i}
                      className="absolute left-1/2 top-8 pointer-events-none"
                      style={{
                        "--tx": `${tx}px`,
                        "--ty": `${ty}px`,
                        "--rot": `${rot}deg`,
                        animation: `confettiBurst 1s ease-out ${delay}s forwards`,
                        zIndex: 50,
                      } as React.CSSProperties}
                    >
                      <div
                        style={{
                          width: size,
                          height: size * 0.6,
                          background: color,
                          borderRadius: Math.random() > 0.5 ? "50%" : "2px",
                          animation: `confettiSpin 1s linear ${delay}s`,
                        }}
                      />
                    </div>
                  );
                })}
              </div>

              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5, type: "spring", stiffness: 200 }}
                className="relative rounded-2xl overflow-hidden p-5 text-center"
                style={{ background: "linear-gradient(135deg, hsl(45 100% 50% / 0.08), hsl(35 80% 45% / 0.04))", border: "1px solid hsl(45 100% 50% / 0.15)" }}
              >

                <motion.div
                  initial={{ scale: 0, rotate: -20 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ delay: 0.2, duration: 0.6, type: "spring", stiffness: 300 }}
                  className="relative inline-block mb-3"
                >
                  <Crown className="w-12 h-12 text-amber-400 mx-auto drop-shadow-lg" style={{ filter: "drop-shadow(0 0 12px hsl(45 100% 50% / 0.5))" }} />
                </motion.div>

                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4, duration: 0.4 }}
                  className="text-[18px] font-bold mb-1 relative"
                  style={{ background: "linear-gradient(135deg, #f6d365, #fda085, #f6d365)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}
                >
                  Welcome to Premium!
                </motion.p>

                <motion.p
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.6, duration: 0.4 }}
                  className="text-[12px] text-muted-foreground mb-4 relative"
                >
                  we greatly appreciate your support 💖
                </motion.p>

                <style>{`
                  @keyframes slashThrough {
                    0% { width: 0; }
                    100% { width: 140%; }
                  }
                  @keyframes underlineGrow {
                    0% { width: 0; }
                    100% { width: 100%; }
                  }
                `}</style>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8, duration: 0.4 }}
                  className="flex items-center justify-center gap-3 relative text-[16px] font-mono font-bold"
                >
                  {/* old fee with animated red slash */}
                  <span className="relative inline-block text-muted-foreground/50">
                    0.35%
                    <span
                      className="absolute left-[-20%] top-1/2 h-[2.5px] rounded-full pointer-events-none"
                      style={{
                        background: "linear-gradient(90deg, transparent, hsl(0 80% 55%), hsl(0 80% 55%), transparent)",
                        transform: "rotate(-12deg)",
                        transformOrigin: "left center",
                        animation: "slashThrough 0.4s ease-out 1.2s forwards",
                        width: 0,
                      }}
                    />
                  </span>

                  <motion.span
                    initial={{ opacity: 0, scale: 0.5 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 1.4, duration: 0.3, type: "spring" }}
                    className="text-muted-foreground/30"
                  >
                    →
                  </motion.span>

                  {/* new fee with animated gold underline */}
                  <motion.span
                    initial={{ opacity: 0, x: 10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 1.5, duration: 0.4, type: "spring" }}
                    className="relative inline-block"
                  >
                    <span style={{ background: "linear-gradient(135deg, #f6d365, #fda085)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
                      0.25%
                    </span>
                    <span
                      className="absolute bottom-[-3px] left-0 h-[2px] rounded-full"
                      style={{
                        background: "linear-gradient(90deg, #f6d365, #fda085)",
                        animation: "underlineGrow 0.4s ease-out 1.8s forwards",
                        width: 0,
                      }}
                    />
                  </motion.span>
                </motion.div>

                <motion.p
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 2.2, duration: 0.4 }}
                  className="text-[11px] text-muted-foreground mt-2 relative"
                >
                  for 30 days
                </motion.p>

                <motion.button
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.2 }}
                  onClick={onClose}
                  className="mt-4 text-[11px] text-muted-foreground hover:text-foreground transition-colors relative"
                >
                  close
                </motion.button>
              </motion.div>
            </div>
          ) : !method ? (
            /* method selection */
            <div className="px-4 pb-4 space-y-2">
              {solanaWallets.length > 0 && (
                <button
                  onClick={() => setMethod("wallet")}
                  className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-surface-border hover:border-amber-400/30 hover:bg-amber-400/5 transition-all text-left group"
                >
                  <div className="w-9 h-9 rounded-lg bg-amber-400/10 flex items-center justify-center group-hover:bg-amber-400/20 transition-colors">
                    <Wallet className="w-4.5 h-4.5 text-amber-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[12px] font-semibold text-foreground">Pay with fees.fun wallet</p>
                    <p className="text-[10px] text-muted-foreground">one click from your wallet</p>
                  </div>
                </button>
              )}

              <button
                onClick={() => setMethod("external")}
                className="w-full flex items-center gap-3 p-3.5 rounded-xl border border-surface-border hover:border-brand/30 hover:bg-brand/5 transition-all text-left group"
              >
                <div className="w-9 h-9 rounded-lg bg-brand/10 flex items-center justify-center group-hover:bg-brand/20 transition-colors">
                  <QrCode className="w-4.5 h-4.5 text-brand-light" />
                </div>
                <div className="flex-1">
                  <p className="text-[12px] font-semibold text-foreground">Pay from external wallet</p>
                  <p className="text-[10px] text-muted-foreground">phantom, solflare, etc.</p>
                </div>
              </button>
            </div>
          ) : method === "wallet" ? (
            /* wallet pay */
            <div className="px-4 pb-4 space-y-3">
              <button onClick={() => { setMethod(null); setError(null); }} className="text-[10px] text-muted-foreground hover:text-foreground transition-colors">
                ← back
              </button>

              <div>
                <label className="text-[11px] text-muted-foreground mb-1.5 block">Pay from</label>
                <select
                  value={selectedWallet}
                  onChange={(e) => setSelectedWallet(e.target.value)}
                  className="w-full text-[12px] bg-surface-raised border border-surface-border rounded-lg px-3 py-2 text-foreground appearance-none cursor-pointer"
                >
                  {solanaWallets.map((w) => (
                    <option key={w.address} value={w.address}>
                      {w.name} ({w.address.slice(0, 4)}...{w.address.slice(-4)})
                    </option>
                  ))}
                </select>
              </div>

              <button
                onClick={handleWalletPay}
                disabled={buying || !payment || !selectedWallet}
                className={cn(
                  "w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[13px] font-bold transition-all",
                  buying
                    ? "bg-amber-400/20 text-amber-400/60 cursor-wait"
                    : "bg-gradient-to-r from-amber-500 to-amber-400 text-black hover:from-amber-400 hover:to-amber-300 shadow-lg shadow-amber-500/25"
                )}
              >
                {buying ? (
                  <><Loader2 className="w-4 h-4 animate-spin" /> Sending...</>
                ) : (
                  <><Crown className="w-4 h-4" /> Pay {payment?.costSol ?? "..."} SOL</>
                )}
              </button>

              {error && <p className="text-[10px] text-destructive text-center">{error}</p>}
            </div>
          ) : (
            /* external wallet — QR code + "I paid" */
            <div className="px-4 pb-4 space-y-3">
              {payment ? (
                <>
                  {/* QR code — solana: URI scannable by phantom */}
                  <div className="flex flex-col items-center gap-2 py-1">
                    <img
                      src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&bgcolor=111113&color=ffffff&data=${encodeURIComponent(solanaUri)}`}
                      alt="QR Code"
                      className="w-[160px] h-[160px] rounded-xl border border-surface-border"
                    />
                    <p className="text-[10px] text-muted-foreground">scan with phantom or any solana wallet</p>
                  </div>

                  {/* address to copy */}
                  <div className="rounded-xl bg-surface-raised border border-surface-border p-3 space-y-1.5">
                    <p className="text-[10px] text-muted-foreground">
                      Send <span className="text-foreground font-semibold font-mono">{payment.costSol} SOL</span> to your payment address:
                    </p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[9px] text-foreground font-mono bg-[#0a0a0b] border border-surface-border rounded-lg px-2 py-1.5 break-all select-all">
                        {payment.address}
                      </code>
                    </div>
                  </div>

                  {/* I paid button */}
                  <button
                    onClick={handleCheckPayment}
                    disabled={checking}
                    className={cn(
                      "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-[12px] font-semibold transition-all",
                      checking
                        ? "bg-brand/20 text-brand-light/60 cursor-wait"
                        : "bg-brand/10 text-brand-light hover:bg-brand/20 border border-brand/20"
                    )}
                  >
                    {checking ? (
                      <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Checking...</>
                    ) : (
                      <><Check className="w-3.5 h-3.5" /> I Paid</>
                    )}
                  </button>
                </>
              ) : (
                <div className="flex justify-center py-4">
                  <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                </div>
              )}

              {error && <p className="text-[10px] text-destructive text-center">{error}</p>}
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

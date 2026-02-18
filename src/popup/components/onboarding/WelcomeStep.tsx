import { useState, useEffect } from "react";
import { Zap, Gift, ArrowRight, Percent, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiGetPromotions, apiApplyReferral, apiGetSavings, ApiError } from "@/lib/api";
import { fetchSolPrice, formatUsd } from "@/lib/solPrice";
import type { Promotion } from "@/lib/types";

interface WelcomeStepProps {
  username: string;
  onNext: () => void;
}

function getDisplayName(name: string): string {
  // "exoticsol_1234147581244" -> "exoticsol"
  const parts = name.split("_");
  if (parts.length > 1 && /^\d+$/.test(parts[parts.length - 1])) {
    return parts.slice(0, -1).join("_");
  }
  return name.length > 14 ? name.slice(0, 14) : name;
}

export function WelcomeStep({ username, onNext }: WelcomeStepProps) {
  const [referralCode, setReferralCode] = useState("");
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [promotion, setPromotion] = useState<Promotion | null>(null);
  const [totalSaved, setTotalSaved] = useState<number | null>(null);
  const [solPrice, setSolPrice] = useState<number | null>(null);
  const displayName = getDisplayName(username);

  useEffect(() => {
    apiGetPromotions()
      .then(({ promotions }) => {
        if (promotions.length > 0) setPromotion(promotions[0]);
      })
      .catch(() => {});
    fetchSolPrice().then(setSolPrice).catch(() => {});
    apiGetSavings()
      .then((data) => {
        if (data.totalSavedSol > 0) setTotalSaved(data.totalSavedSol);
      })
      .catch(() => {});
  }, []);

  const handleApply = async () => {
    if (!referralCode.trim()) return;
    setApplying(true);
    setError("");
    try {
      await apiApplyReferral(referralCode.trim());
      setSuccess(true);
      setTimeout(onNext, 1200);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to apply code");
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-surface-base relative overflow-hidden">
      {/* Ambient glow effects */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-brand/8 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[200px] h-[200px] bg-brand/5 rounded-full blur-[80px] pointer-events-none" />

      {/* Top accent */}
      <div className="h-[2px] bg-gradient-to-r from-transparent via-brand to-transparent" />

      {/* Content */}
      <div className="flex-1 flex flex-col px-6 pt-8 pb-5 relative z-10">
        {/* Logo + Welcome */}
        <div className="text-center animate-scale-in">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-light flex items-center justify-center shadow-xl shadow-brand-glow mx-auto mb-4 animate-float">
            <Zap className="w-7 h-7 text-white" />
          </div>
          <h1 className="text-lg font-bold text-white tracking-tight">
            Welcome, <span className="text-brand-light">{displayName}</span>
          </h1>
          <p className="text-gray-500">{"Let's get you set up to start saving!"}</p>
          {totalSaved !== null && (
              <p className="text-gray-600 italic">{"Already over "}
                {solPrice ? (
                  <span className="font-semibold text-emerald-400">{formatUsd(totalSaved * solPrice)}</span>
                ) : (
                  <span className="inline-block w-16 h-4 bg-surface-raised rounded animate-pulse align-middle" />
                )}
                {" saved."}
              </p>
            )}
        </div>

        {/* Promotion Banner */}
        {promotion && (
          <div className="mt-5 animate-slide-up" style={{ animationDelay: "0.15s", opacity: 0 }}>
            <div className="relative rounded-2xl overflow-hidden">
              {/* Shimmer border effect */}
              <div
                className="absolute inset-0 rounded-2xl p-[1px]"
                style={{
                  background: "linear-gradient(90deg, transparent, rgba(86,100,242,0.5), rgba(94,107,250,0.8), rgba(86,100,242,0.5), transparent)",
                  backgroundSize: "200% 100%",
                  animation: "shimmer 2.5s linear infinite",
                }}
              >
                <div className="w-full h-full rounded-2xl bg-surface-raised" />
              </div>

              {/* Banner content */}
              <div className="relative px-4 py-4">
                <div className="flex items-center gap-2 mb-2.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/15 flex items-center justify-center">
                    <Percent className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    Launch Promo
                  </span>
                </div>

                <div className="flex items-baseline gap-2 mb-1">
                  <span className="text-2xl font-bold text-white">
                    {promotion.feePercent}%
                  </span>
                  <span className="text-sm text-gray-500 line-through">
                    {promotion.normalFee}%
                  </span>
                  <span className="text-xs text-gray-400">fees</span>
                </div>

                <div className="flex items-center gap-1.5 mt-2">
                  <Clock className="w-3 h-3 text-gray-500" />
                  <span className="text-[11px] text-gray-400">
                    {promotion.durationDays} days for all new users
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Referral code input */}
        <div className="mt-5 animate-slide-up" style={{ animationDelay: "0.3s", opacity: 0 }}>
          <label className="text-[11px] font-medium text-gray-400 mb-2 block flex items-center gap-1.5">
            <Gift className="w-3 h-3" />
            Have a referral code?
          </label>

          <div className="flex gap-2">
            <div className="flex-1 relative group">
              <input
                type="text"
                placeholder="Enter code"
                value={referralCode}
                onChange={(e) => {
                  setReferralCode(e.target.value.toUpperCase());
                  setError("");
                }}
                disabled={applying || success}
                maxLength={16}
                className={cn(
                  "w-full bg-surface-raised border rounded-xl px-4 py-3 text-sm font-mono text-white placeholder-gray-600 uppercase tracking-widest",
                  "focus:outline-none focus:ring-1 transition-all",
                  error
                    ? "border-red-500/40 focus:border-red-500/60 focus:ring-red-500/20"
                    : success
                      ? "border-emerald-500/40 focus:border-emerald-500/60 focus:ring-emerald-500/20"
                      : "border-surface-border focus:border-brand/40 focus:ring-brand/15",
                  (applying || success) && "opacity-60 cursor-not-allowed"
                )}
              />
              {success && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="w-5 h-5 text-emerald-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 13l4 4L19 7" className="animate-check-draw" style={{ strokeDasharray: 20, strokeDashoffset: 20 }} />
                  </svg>
                </div>
              )}
            </div>
            <button
              onClick={handleApply}
              disabled={!referralCode.trim() || applying || success}
              className={cn(
                "px-4 rounded-xl text-sm font-semibold transition-all flex items-center justify-center",
                !referralCode.trim() || success
                  ? "bg-surface-raised border border-surface-border text-gray-600 cursor-not-allowed"
                  : applying
                    ? "bg-brand/50 text-white/70 cursor-not-allowed"
                    : "bg-brand text-white hover:bg-brand-dark shadow-lg shadow-brand-glow active:scale-[0.97]"
              )}
            >
              {applying ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                "Apply"
              )}
            </button>
          </div>

          {error && (
            <p className="text-[11px] text-red-400 mt-1.5 animate-fade-in">{error}</p>
          )}
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Skip / Continue */}
        <div className="animate-slide-up" style={{ animationDelay: "0.45s", opacity: 0 }}>
          <button
            onClick={onNext}
            disabled={applying}
            className="w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 bg-surface-raised border border-surface-border text-gray-300 hover:bg-surface-overlay hover:text-white hover:border-surface-border-light transition-all active:scale-[0.98]"
          >
            {referralCode.trim() ? "Skip Referral" : "Continue without code"}
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

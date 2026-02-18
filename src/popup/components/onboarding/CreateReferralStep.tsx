import { useState, useEffect, useRef, useCallback } from "react";
import { Link, Check, X, Loader2, ArrowRight, Copy, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiCheckReferralCode, apiCreateReferralCode, ApiError } from "@/lib/api";

interface CreateReferralStepProps {
  onComplete: (code: string | null) => void;
}

type AvailabilityStatus = "idle" | "checking" | "available" | "taken" | "invalid";

export function CreateReferralStep({ onComplete }: CreateReferralStepProps) {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<AvailabilityStatus>("idle");
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState(false);
  const [createdCode, setCreatedCode] = useState("");
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  const checkAvailability = useCallback(async (value: string) => {
    if (value.length < 3) {
      setStatus("idle");
      return;
    }

    if (!/^[A-Z0-9_-]{3,16}$/.test(value)) {
      setStatus("invalid");
      return;
    }

    setStatus("checking");
    try {
      const { available } = await apiCheckReferralCode(value);
      setStatus(available ? "available" : "taken");
    } catch {
      setStatus("idle");
    }
  }, []);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    const upper = code.trim().toUpperCase();
    if (!upper) {
      setStatus("idle");
      return;
    }

    debounceRef.current = setTimeout(() => {
      checkAvailability(upper);
    }, 400);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [code, checkAvailability]);

  const handleCreate = async () => {
    if (status !== "available") return;
    setCreating(true);
    setError("");
    try {
      const { referralCode } = await apiCreateReferralCode(code.trim());
      setCreatedCode(referralCode);
      setCreated(true);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        if (err.status === 409) setStatus("taken");
      } else {
        setError("Failed to create code");
      }
    } finally {
      setCreating(false);
    }
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(createdCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const statusConfig = {
    idle: { icon: null, color: "border-surface-border", text: "" },
    checking: {
      icon: <Loader2 className="w-4 h-4 text-gray-400 animate-spin" />,
      color: "border-surface-border",
      text: "Checking...",
    },
    available: {
      icon: <Check className="w-4 h-4 text-emerald-400" />,
      color: "border-emerald-500/40",
      text: "Available!",
    },
    taken: {
      icon: <X className="w-4 h-4 text-red-400" />,
      color: "border-red-500/40",
      text: "Already taken",
    },
    invalid: {
      icon: <X className="w-4 h-4 text-amber-400" />,
      color: "border-amber-500/40",
      text: "Letters, numbers, dashes only (3-16 chars)",
    },
  };

  const current = statusConfig[status];

  // ── Success state ──
  if (created) {
    return (
      <div className="flex flex-col min-h-screen bg-surface-base relative overflow-hidden">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-brand/8 rounded-full blur-[100px] pointer-events-none" />
        <div className="h-[2px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent" />

        <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10">
          <div className="animate-bounce-in">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center mb-5">
              <Sparkles className="w-7 h-7 text-emerald-400" />
            </div>
          </div>

          <h2 className="text-lg font-bold text-white animate-scale-in" style={{ animationDelay: "0.15s", opacity: 0 }}>
            {"You're all set!"}
          </h2>
          <p className="text-xs text-gray-400 mt-1 text-center animate-scale-in" style={{ animationDelay: "0.25s", opacity: 0 }}>
            Share your code with friends
          </p>

          {/* Big code display */}
          <div className="mt-6 w-full animate-scale-in" style={{ animationDelay: "0.35s", opacity: 0 }}>
            <div className="bg-surface-raised border border-surface-border-light rounded-2xl px-5 py-4 flex items-center justify-between">
              <span className="text-xl font-mono font-bold text-brand-light tracking-[0.2em]">
                {createdCode}
              </span>
              <button
                onClick={handleCopy}
                className={cn(
                  "p-2.5 rounded-xl transition-all",
                  copied
                    ? "bg-emerald-500/15 text-emerald-400"
                    : "bg-surface-overlay text-gray-400 hover:text-white hover:bg-surface-border"
                )}
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            onClick={() => onComplete(createdCode)}
            className="mt-6 w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 bg-brand text-white hover:bg-brand-dark shadow-lg shadow-brand-glow active:scale-[0.98] transition-all animate-slide-up"
            style={{ animationDelay: "0.5s", opacity: 0 }}
          >
            Start using fees.fun
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // ── Create form ──
  return (
    <div className="flex flex-col min-h-screen bg-surface-base relative overflow-hidden">
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[300px] h-[300px] bg-brand/8 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-0 left-0 w-[200px] h-[200px] bg-brand/5 rounded-full blur-[80px] pointer-events-none" />
      <div className="h-[2px] bg-gradient-to-r from-transparent via-brand to-transparent" />

      <div className="flex-1 flex flex-col px-6 pt-8 pb-5 relative z-10">
        {/* Header */}
        <div className="text-center animate-slide-in-right">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-brand to-brand-light flex items-center justify-center shadow-xl shadow-brand-glow mx-auto mb-4 animate-float">
            <Link className="w-7 h-7 text-white" />
          </div>
          <h2 className="text-lg font-bold text-white tracking-tight">
            Create Your Code
          </h2>
          <p className="text-xs text-gray-500 mt-1">
            Share it and earn when friends sign up
          </p>
        </div>

        {/* Big centered input */}
        <div className="mt-8 animate-slide-in-right" style={{ animationDelay: "0.1s", opacity: 0 }}>
          <div className={cn(
            "relative rounded-2xl border-2 transition-all bg-surface-raised overflow-hidden",
            current.color,
            status === "available" && "shadow-[0_0_20px_rgba(16,185,129,0.1)]",
          )}>
            <input
              type="text"
              placeholder="YOUR-CODE"
              value={code}
              onChange={(e) => {
                const val = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, "");
                setCode(val);
                setError("");
              }}
              maxLength={16}
              disabled={creating}
              className="w-full bg-transparent px-5 py-5 text-center text-2xl font-mono font-bold text-white placeholder-gray-700 tracking-[0.15em] focus:outline-none"
            />

            {/* Status indicator */}
            {status !== "idle" && (
              <div className="absolute right-4 top-1/2 -translate-y-1/2 animate-fade-in">
                {current.icon}
              </div>
            )}
          </div>

          {/* Status text */}
          <div className="h-5 mt-2 flex items-center justify-center">
            {current.text && (
              <p className={cn(
                "text-[11px] font-medium animate-fade-in",
                status === "available" && "text-emerald-400",
                status === "taken" && "text-red-400",
                status === "invalid" && "text-amber-400",
                status === "checking" && "text-gray-500",
              )}>
                {current.text}
              </p>
            )}
            {error && (
              <p className="text-[11px] text-red-400 animate-fade-in">{error}</p>
            )}
          </div>
        </div>

        {/* Character count */}
        <div className="flex justify-center mt-1 animate-slide-in-right" style={{ animationDelay: "0.15s", opacity: 0 }}>
          <span className={cn(
            "text-[10px] font-mono",
            code.length >= 3 ? "text-gray-500" : "text-gray-700"
          )}>
            {code.length}/16
          </span>
        </div>

        <div className="flex-1" />

        {/* Action buttons */}
        <div className="flex flex-col gap-2.5 animate-slide-in-right" style={{ animationDelay: "0.25s", opacity: 0 }}>
          <button
            onClick={handleCreate}
            disabled={status !== "available" || creating}
            className={cn(
              "w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all",
              status === "available" && !creating
                ? "bg-brand text-white hover:bg-brand-dark shadow-lg shadow-brand-glow active:scale-[0.98]"
                : "bg-surface-raised border border-surface-border text-gray-600 cursor-not-allowed"
            )}
          >
            {creating ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Claim This Code
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <button
            onClick={() => onComplete(null)}
            disabled={creating}
            className="w-full py-3 rounded-xl text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            {"I'll do this later"}
          </button>
        </div>
      </div>
    </div>
  );
}

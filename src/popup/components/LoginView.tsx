import { useState } from "react";
import { Zap, User, Lock, ArrowRight, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { login } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import type { AuthUser } from "@/lib/types";

interface LoginViewProps {
  onAuthenticated: (user: AuthUser) => void;
}

export function LoginView({ onAuthenticated }: LoginViewProps) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setError("Please fill in all fields");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const user = await login(username, password);
      onAuthenticated(user);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError("Failed to connect to server");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col animate-fade-in min-h-screen">
      {/* Top accent stripe -- two thin lines */}
      <div className="flex w-full h-[3px]">
        <div className="flex-1 bg-white/10" />
        <div className="flex-1 bg-brand/40" />
      </div>

      {/* Hero Section */}
      <div className="px-6 pt-9 pb-8 text-center relative">
        {/* Subtle glow behind logo */}
        <div className="absolute top-6 left-1/2 -translate-x-1/2 w-32 h-32 bg-brand/10 rounded-full blur-3xl pointer-events-none" />
        <div className="relative">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-brand to-brand-light flex items-center justify-center shadow-xl shadow-brand-glow mx-auto mb-5 animate-pulse-glow">
            <Zap className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-xl font-bold text-white tracking-tight">
            Fees<span className="text-brand-light">.fun</span>
          </h1>
          <p className="text-[11px] text-gray-500 mt-1.5 font-medium">
            Save on every trade
          </p>
        </div>
      </div>

      {error && (
        <div className="px-5 pb-3">
          <div className="flex items-center gap-2.5 px-4 py-3 rounded-xl bg-red-500/8 border border-red-500/15">
            <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
            <span className="text-xs text-red-400">{error}</span>
          </div>
        </div>
      )}

      <div className="px-5 pb-5 flex-1">
        <form onSubmit={handleSignIn} className="flex flex-col gap-3.5">
          <InputField
            icon={<User className="w-4 h-4" />}
            type="text"
            placeholder="Username"
            value={username}
            onChange={setUsername}
            disabled={loading}
          />
          <InputField
            icon={<Lock className="w-4 h-4" />}
            type="password"
            placeholder="Password"
            value={password}
            onChange={setPassword}
            disabled={loading}
          />

          <button
            type="submit"
            disabled={loading}
            className={cn(
              "w-full py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all mt-1",
              loading
                ? "bg-brand/50 text-white/70 cursor-not-allowed"
                : "bg-brand text-white hover:bg-brand-dark shadow-lg shadow-brand-glow active:scale-[0.98]"
            )}
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <>
                Sign In
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>

          <div className="flex items-center justify-center gap-1.5 mt-1">
            <span className="text-[10px] text-gray-600">{"Don't have an account?"}</span>
            <a
              href="https://discord.gg/feesdotfun"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[10px] text-brand-light hover:text-white font-medium transition-colors"
            >
              Join Discord
            </a>
          </div>
        </form>
      </div>

      <div className="px-5 py-3 border-t border-surface-border flex items-center justify-center gap-1.5">
        <img src="/images/turnkey.png" alt="Turnkey" className="w-3.5 h-3.5 opacity-60" />
        <span className="text-[10px] text-gray-500">Powered by <a href="https://turnkey.com" target="_blank" rel="noopener noreferrer" className="text-gray-300 hover:text-brand-light transition-colors">Turnkey</a></span>
      </div>
    </div>
  );
}

function InputField({
  icon,
  type,
  placeholder,
  value,
  onChange,
  disabled,
}: {
  icon: React.ReactNode;
  type: string;
  placeholder: string;
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="relative group">
      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600 group-focus-within:text-brand-light transition-colors">
        {icon}
      </div>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={cn(
          "w-full bg-surface-raised border border-surface-border rounded-xl pl-11 pr-4 py-3.5 text-sm text-gray-200 placeholder-gray-600",
          "focus:outline-none focus:border-brand/40 focus:ring-1 focus:ring-brand/15 focus:bg-surface-overlay transition-all",
          disabled && "opacity-50 cursor-not-allowed"
        )}
      />
    </div>
  );
}

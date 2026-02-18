import { useState, useEffect } from "react";
import type { AuthUser } from "@/lib/types";
import { checkSession, logout as authLogout } from "@/lib/auth";
import { BUILD_ID } from "@/lib/buildInfo";
import { LoginView } from "./components/LoginView";
import { WalletManager } from "./components/WalletManager";
import { OnboardingFlow } from "./components/onboarding/OnboardingFlow";

const IS_DEV = import.meta.env.DEV;

// Always log build ID so it's available in the console for debugging
console.log(`[fees.fun] Build ${BUILD_ID}`);

export default function App() {
  const [authUser, setAuthUser] = useState<AuthUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    checkSession()
      .then((user) => setAuthUser(user))
      .finally(() => setAuthLoading(false));
  }, []);

  const handleLogout = async () => {
    await authLogout();
    setAuthUser(null);
  };

  const handleAuthenticated = (user: AuthUser) => {
    setAuthUser(user);
  };

  if (authLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-[600px] bg-surface-base relative overflow-hidden">
        {/* Ambient glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-brand/8 rounded-full blur-[80px] pointer-events-none animate-glow-pulse" />

        <div className="relative flex flex-col items-center gap-5 animate-scale-in">
          {/* Logo */}
          <div className="relative">
            {/* Expanding ring */}
            <div className="absolute inset-0 w-16 h-16 rounded-2xl border border-brand/20 animate-ring-expand" />
            <img
              src="/icons/feesfun.png"
              alt="fees.fun"
              className="w-16 h-16 rounded-2xl shadow-xl shadow-brand-glow animate-float"
            />
          </div>

          {/* Brand text */}
          <div className="flex flex-col items-center gap-1.5">
            <h1 className="text-lg font-bold text-white tracking-tight">
              {"Fees"}<span className="text-brand-light">{".fun"}</span>
            </h1>
            <div className="flex items-center gap-2">
              <div className="flex gap-1">
                <div className="w-1 h-1 rounded-full bg-brand-light animate-pulse" style={{ animationDelay: "0ms" }} />
                <div className="w-1 h-1 rounded-full bg-brand-light animate-pulse" style={{ animationDelay: "150ms" }} />
                <div className="w-1 h-1 rounded-full bg-brand-light animate-pulse" style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>

          {IS_DEV && <p className="text-[10px] text-gray-600">{"Build "}{BUILD_ID}</p>}
        </div>
      </div>
    );
  }

  if (!authUser) {
    return (
      <div className="bg-surface-base h-[600px] flex flex-col overflow-hidden">
        <div className="flex-1 min-h-0">
          <LoginView onAuthenticated={handleAuthenticated} />
        </div>
        {IS_DEV && (
          <div className="px-3 py-1 flex-shrink-0">
            <p className="text-[10px] text-gray-500 text-right">Build {BUILD_ID}</p>
          </div>
        )}
      </div>
    );
  }

  if (!authUser.onboardingComplete) {
    return (
      <OnboardingFlow
        user={authUser}
        onComplete={(updatedUser) => setAuthUser(updatedUser)}
      />
    );
  }

  return (
    <WalletManager user={authUser} onLogout={handleLogout} />
  );
}

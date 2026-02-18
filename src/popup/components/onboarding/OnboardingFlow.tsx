import { useState, useCallback } from "react";
import { WelcomeStep } from "./WelcomeStep";
import { CreateReferralStep } from "./CreateReferralStep";
import { apiCompleteOnboarding } from "@/lib/api";
import type { AuthUser } from "@/lib/types";

interface OnboardingFlowProps {
  user: AuthUser;
  onComplete: (updatedUser: AuthUser) => void;
}

export function OnboardingFlow({ user, onComplete }: OnboardingFlowProps) {
  const [step, setStep] = useState<"welcome" | "create-code" | "transitioning">("welcome");
  const [transitioning, setTransitioning] = useState(false);

  const transitionTo = useCallback((nextStep: "welcome" | "create-code" | "transitioning") => {
    setTransitioning(true);
    setTimeout(() => {
      setStep(nextStep);
      setTransitioning(false);
    }, 300);
  }, []);

  const handleWelcomeNext = () => {
    transitionTo("create-code");
  };

  const handleCreateComplete = async (code: string | null) => {
    try {
      await apiCompleteOnboarding();
    } catch {
      // Continue anyway - we'll mark it complete
    }

    const updatedUser: AuthUser = {
      ...user,
      onboardingComplete: true,
      referralCode: code ? { code, uses: 0 } : user.referralCode,
    };
    onComplete(updatedUser);
  };

  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* Step indicator */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
        <div className="flex items-center gap-1.5">
          <div className={`w-6 h-1 rounded-full transition-all duration-300 ${
            step === "welcome" ? "bg-brand" : "bg-brand/40"
          }`} />
          <div className={`w-6 h-1 rounded-full transition-all duration-300 ${
            step === "create-code" ? "bg-brand" : "bg-surface-border"
          }`} />
        </div>
      </div>

      {/* Steps with transition */}
      <div className={`transition-all duration-300 ${
        transitioning ? "opacity-0 scale-95" : "opacity-100 scale-100"
      }`}>
        {step === "welcome" && (
          <WelcomeStep username={user.username} onNext={handleWelcomeNext} />
        )}
        {step === "create-code" && (
          <CreateReferralStep onComplete={handleCreateComplete} />
        )}
      </div>
    </div>
  );
}

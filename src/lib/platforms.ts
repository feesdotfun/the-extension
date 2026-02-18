export const PLATFORMS = [
  { id: "rapidlaunch", name: "RapidLaunch", logo: "/images/platforms/rapidlaunch.png", chain: "solana", alwaysActive: false },
  { id: "uxento", name: "Uxento", logo: "/images/platforms/uxento.png", chain: "solana", alwaysActive: false },
  { id: "j7tracker", name: "J7 Tracker", logo: "/images/platforms/j7tracker.png", chain: "solana", alwaysActive: false },
  { id: "axiom", name: "Axiom", logo: "/images/platforms/axiom.png", chain: "solana", alwaysActive: true },
] as const;

export type PlatformId = (typeof PLATFORMS)[number]["id"];
export type DeployerConfig = Partial<Record<PlatformId, string>>;

import { getAuthToken } from "./storage";
import type { AuthUser, TurnkeySession, TrackedAccount, Promotion } from "./types";
import type { DeployerConfig } from "./platforms";

const API_BASE = import.meta.env.VITE_API_URL || "https://www.fees.fun";

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const token = await getAuthToken();

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
  });

  const data = await res.json();

  if (!res.ok) {
    throw new ApiError(data.error || "Something went wrong", res.status);
  }

  return data as T;
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
    this.name = "ApiError";
  }
}

// --- Auth endpoints ---

export async function apiLogin(
  username: string,
  password: string
): Promise<{ token: string; user: AuthUser; turnkey: TurnkeySession }> {
  return request("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ username, password }),
  });
}

export async function apiGetSession(): Promise<{ user: AuthUser }> {
  return request("/api/auth/session");
}

export async function apiLogout(): Promise<{ message: string }> {
  return request("/api/auth/logout", { method: "POST" });
}

export async function apiRefreshTurnkeySession(): Promise<{
  turnkey: TurnkeySession;
}> {
  return request("/api/auth/turnkey-session", { method: "POST" });
}

// --- Tracker endpoints ---

export async function apiGetTrackedAccounts(): Promise<{
  accounts: TrackedAccount[];
}> {
  return request("/api/tracker/accounts");
}

export async function apiAddTrackedAccount(
  username: string
): Promise<{ account: TrackedAccount }> {
  return request("/api/tracker/accounts", {
    method: "POST",
    body: JSON.stringify({ username }),
  });
}

export async function apiRemoveTrackedAccount(
  twitterId: string
): Promise<{ success: boolean }> {
  return request("/api/tracker/accounts", {
    method: "DELETE",
    body: JSON.stringify({ twitterId }),
  });
}

// --- Ping ---

export async function apiPing(): Promise<number> {
  const start = performance.now();
  await fetch(`${API_BASE}/api/health`);
  return Math.round(performance.now() - start);
}

// --- Server selection ---

export const SERVERS = [
  { id: "eu" as const, label: "EU", wsUrl: "wss://api-eu.fees.fun", httpUrl: "https://api-eu.fees.fun" },
  { id: "ny" as const, label: "NY", wsUrl: "wss://api-ny.fees.fun", httpUrl: "https://api-ny.fees.fun" },
  { id: "sf" as const, label: "SF", wsUrl: "wss://api-sf.fees.fun", httpUrl: "https://api-sf.fees.fun" },
] as const;

export const DEV_SERVER = {
  id: "dev" as const, label: "DEV", wsUrl: "ws://localhost:3001", httpUrl: "http://localhost:3001",
} as const;

export type ServerId = typeof SERVERS[number]["id"] | "auto" | "dev";

export async function pingServer(httpUrl: string): Promise<number> {
  const start = performance.now();
  await fetch(`${httpUrl}/api/health`);
  return Math.round(performance.now() - start);
}

// --- Deployer config endpoints ---

export async function apiGetDeployerConfig(): Promise<{
  configs: DeployerConfig;
}> {
  return request("/api/deployer/config");
}

export async function apiSetDeployerConfig(
  configs: DeployerConfig
): Promise<{ configs: DeployerConfig }> {
  return request("/api/deployer/config", {
    method: "PUT",
    body: JSON.stringify({ configs }),
  });
}

// --- Promotions ---

export async function apiGetPromotions(): Promise<{ promotions: Promotion[] }> {
  return request("/api/promotions");
}

// --- Referral endpoints ---

export async function apiApplyReferral(
  code: string
): Promise<{ success: boolean; message: string }> {
  return request("/api/referral/apply", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function apiCreateReferralCode(
  code: string
): Promise<{ success: boolean; referralCode: string }> {
  return request("/api/referral/create", {
    method: "POST",
    body: JSON.stringify({ code }),
  });
}

export async function apiCheckReferralCode(
  code: string
): Promise<{ available: boolean }> {
  return request(`/api/referral/check?code=${encodeURIComponent(code)}`);
}

// --- Fees / Savings ---

export interface PlatformSavings {
  txCount: number;
  totalVolume: number;
  platformFees: number;
  feesfunFees: number;
  saved: number;
}

export interface SavingsResponse {
  totalTransactions: number;
  totalSavedSol: number;
  totalPlatformFees: number;
  totalFeesfunFees: number;
  byPlatform: Record<string, PlatformSavings>;
}

export async function apiGetSavings(): Promise<SavingsResponse> {
  return request("/api/fees/savings");
}

// --- Onboarding ---

export async function apiCompleteOnboarding(): Promise<{ success: boolean }> {
  return request("/api/onboarding/complete", { method: "POST" });
}

// --- Subscription ---

export interface SubscriptionStatus {
  active: boolean;
  expiresAt: string | null;
  daysRemaining: number | null;
  feePercent: number;
}

export interface SubscriptionPrice {
  priceUsd: number;
  costSol: number;
  costUsd: number;
}

export async function apiGetSubscription(): Promise<SubscriptionStatus> {
  return request("/api/subscription");
}

export async function apiGetSubscriptionPrice(): Promise<SubscriptionPrice> {
  return request("/api/subscription/price");
}

export async function apiActivateSubscription(txSignature: string): Promise<SubscriptionStatus> {
  return request("/api/subscription/activate", {
    method: "POST",
    body: JSON.stringify({ txSignature }),
  });
}

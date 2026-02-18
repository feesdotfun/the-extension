// Popup types
export interface AuthUser {
  id: string;
  username: string;
  onboardingComplete: boolean;
  referralCode?: { code: string; uses: number } | null;
}

export interface Promotion {
  id: string;
  name: string;
  description: string;
  feePercent: number;
  normalFee: number;
  durationDays: number;
  active: boolean;
  startsAt: string;
  expiresAt: string | null;
}

export interface TurnkeySession {
  organizationId: string;
  userId: string;
  apiPublicKey: string;
  apiPrivateKey: string;
}

export interface WalletAccount {
  address: string;
  addressFormat: string;
  path: string;
}

export interface Wallet {
  walletId: string;
  walletName: string;
  accounts: WalletAccount[];
  createdAt?: string;
}

export interface TrackedAccount {
  id: string;
  twitterId: string;
  twitterUsername: string;
  createdAt: string;
}

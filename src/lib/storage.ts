import type { AuthUser, TurnkeySession } from "./types";
import type { DeployerConfig } from "./platforms";
import type { ServerId } from "./api";

const AUTH_TOKEN_KEY = "feesfun-auth-token";
const AUTH_USER_KEY = "feesfun-auth-user";
const TURNKEY_SESSION_KEY = "turnkey-session";
const DEPLOYER_CONFIG_KEY = "deployer-config";
const WALLET_CACHE_KEY = "feesfun-wallet-cache";
const SERVER_SELECTION_KEY = "feesfun-server-selection";
const PROMO_DISMISSED_KEY = "feesfun-promo-dismissed";

export async function getAuthToken(): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(AUTH_TOKEN_KEY, (result) => {
        resolve(result[AUTH_TOKEN_KEY] ?? null);
      });
    } else {
      resolve(localStorage.getItem(AUTH_TOKEN_KEY));
    }
  });
}

export async function setAuthToken(token: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [AUTH_TOKEN_KEY]: token }, resolve);
    } else {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      resolve();
    }
  });
}

export async function clearAuthToken(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.remove([AUTH_TOKEN_KEY, AUTH_USER_KEY, TURNKEY_SESSION_KEY, DEPLOYER_CONFIG_KEY, WALLET_CACHE_KEY], resolve);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
      localStorage.removeItem(TURNKEY_SESSION_KEY);
      localStorage.removeItem(DEPLOYER_CONFIG_KEY);
      localStorage.removeItem(WALLET_CACHE_KEY);
      resolve();
    }
  });
}

// ─── Turnkey Session Storage ──────────

export async function getTurnkeySession(): Promise<TurnkeySession | null> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(TURNKEY_SESSION_KEY, (result) => {
        resolve(result[TURNKEY_SESSION_KEY] ?? null);
      });
    } else {
      const stored = localStorage.getItem(TURNKEY_SESSION_KEY);
      resolve(stored ? JSON.parse(stored) : null);
    }
  });
}

export async function setTurnkeySession(session: TurnkeySession): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [TURNKEY_SESSION_KEY]: session }, resolve);
    } else {
      localStorage.setItem(TURNKEY_SESSION_KEY, JSON.stringify(session));
      resolve();
    }
  });
}

export async function clearTurnkeySession(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.remove(TURNKEY_SESSION_KEY, resolve);
    } else {
      localStorage.removeItem(TURNKEY_SESSION_KEY);
      resolve();
    }
  });
}

export async function setAuthUser(user: AuthUser): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [AUTH_USER_KEY]: user }, resolve);
    } else {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
      resolve();
    }
  });
}

// ─── Deployer Config Storage ──────────

export async function getDeployerConfig(): Promise<DeployerConfig | null> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(DEPLOYER_CONFIG_KEY, (result) => {
        resolve(result[DEPLOYER_CONFIG_KEY] ?? null);
      });
    } else {
      const stored = localStorage.getItem(DEPLOYER_CONFIG_KEY);
      resolve(stored ? JSON.parse(stored) : null);
    }
  });
}

export async function setDeployerConfig(config: DeployerConfig): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [DEPLOYER_CONFIG_KEY]: config }, resolve);
    } else {
      localStorage.setItem(DEPLOYER_CONFIG_KEY, JSON.stringify(config));
      resolve();
    }
  });
}

// ─── Server Selection Storage ──────────

export interface ServerSelection {
  serverId: ServerId;
  wsUrl: string;
  httpUrl: string;
}

export async function getServerSelection(): Promise<ServerSelection | null> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(SERVER_SELECTION_KEY, (result) => {
        resolve(result[SERVER_SELECTION_KEY] ?? null);
      });
    } else {
      const stored = localStorage.getItem(SERVER_SELECTION_KEY);
      resolve(stored ? JSON.parse(stored) : null);
    }
  });
}

export async function setServerSelection(selection: ServerSelection): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [SERVER_SELECTION_KEY]: selection }, resolve);
    } else {
      localStorage.setItem(SERVER_SELECTION_KEY, JSON.stringify(selection));
      resolve();
    }
  });
}

// ─── Promo Dismiss Storage ──────────

const PROMO_DISMISS_DURATION = 24 * 60 * 60 * 1000; // 24 hours

export async function getPromoDismissedAt(): Promise<number | null> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(PROMO_DISMISSED_KEY, (result) => {
        resolve(result[PROMO_DISMISSED_KEY] ?? null);
      });
    } else {
      const stored = localStorage.getItem(PROMO_DISMISSED_KEY);
      resolve(stored ? Number(stored) : null);
    }
  });
}

export async function setPromoDismissedAt(): Promise<void> {
  const now = Date.now();
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [PROMO_DISMISSED_KEY]: now }, resolve);
    } else {
      localStorage.setItem(PROMO_DISMISSED_KEY, String(now));
      resolve();
    }
  });
}

export async function isPromoDismissed(): Promise<boolean> {
  const dismissedAt = await getPromoDismissedAt();
  if (!dismissedAt) return false;
  return Date.now() - dismissedAt < PROMO_DISMISS_DURATION;
}

// ─── Extension Settings ──────────

const EXTENSION_SETTINGS_KEY = "feesfun-settings";

export interface ExtensionSettings {
  localSigning: boolean;
  watermarksEnabled: boolean;
}

const DEFAULT_EXTENSION_SETTINGS: ExtensionSettings = {
  localSigning: true,
  watermarksEnabled: true,
};

export async function getExtensionSettings(): Promise<ExtensionSettings> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(EXTENSION_SETTINGS_KEY, (result) => {
        resolve({ ...DEFAULT_EXTENSION_SETTINGS, ...(result[EXTENSION_SETTINGS_KEY] ?? {}) });
      });
    } else {
      const stored = localStorage.getItem(EXTENSION_SETTINGS_KEY);
      resolve({ ...DEFAULT_EXTENSION_SETTINGS, ...(stored ? JSON.parse(stored) : {}) });
    }
  });
}

export async function setExtensionSettings(updates: Partial<ExtensionSettings>): Promise<void> {
  const current = await getExtensionSettings();
  const merged = { ...current, ...updates };
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [EXTENSION_SETTINGS_KEY]: merged }, resolve);
    } else {
      localStorage.setItem(EXTENSION_SETTINGS_KEY, JSON.stringify(merged));
      resolve();
    }
  });
}

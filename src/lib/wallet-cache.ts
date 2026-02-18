import type { Wallet } from "./types";

const CACHE_KEY = "feesfun-wallet-cache";

// pbkdf2 params - kept constant so cached keys survive extension updates
const SECRET = import.meta.env.VITE_WALLET_ENC_SECRET;
const SALT = new Uint8Array(import.meta.env.VITE_WALLET_ENC_SALT.split(",").map(Number));

interface CacheEntry {
  ct: string;
  iv: string;
  walletId: string;
  walletName: string;
  chain: "solana" | "evm";
  cachedAt: number;
}

type WalletCache = Record<string, CacheEntry>;

let _aesKey: CryptoKey | null = null;

async function getAesKey(): Promise<CryptoKey> {
  if (_aesKey) return _aesKey;

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(SECRET),
    "PBKDF2",
    false,
    ["deriveKey"],
  );

  _aesKey = await crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: SALT, iterations: 100_000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );

  return _aesKey;
}

function toBase64(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function encrypt(plaintext: string): Promise<{ ct: string; iv: string }> {
  const key = await getAesKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    enc.encode(plaintext),
  );
  return { ct: toBase64(ciphertext), iv: toBase64(iv) };
}

async function decrypt(ct: string, iv: string): Promise<string> {
  const key = await getAesKey();
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: fromBase64(iv) },
    key,
    fromBase64(ct),
  );
  return new TextDecoder().decode(plainBuf);
}

function readCache(): Promise<WalletCache> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.get(CACHE_KEY, (result) => {
        resolve((result[CACHE_KEY] as WalletCache) ?? {});
      });
    } else {
      try {
        const stored = localStorage.getItem(CACHE_KEY);
        resolve(stored ? JSON.parse(stored) : {});
      } catch {
        resolve({});
      }
    }
  });
}

function writeCache(cache: WalletCache): Promise<void> {
  return new Promise((resolve) => {
    if (typeof chrome !== "undefined" && chrome.storage) {
      chrome.storage.local.set({ [CACHE_KEY]: cache }, resolve);
    } else {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
      resolve();
    }
  });
}

export async function cacheWallet(
  address: string,
  privateKey: string,
  meta: { walletId: string; walletName: string; chain: "solana" | "evm" },
): Promise<void> {
  const { ct, iv } = await encrypt(privateKey);
  const cache = await readCache();
  cache[address] = {
    ct,
    iv,
    walletId: meta.walletId,
    walletName: meta.walletName,
    chain: meta.chain,
    cachedAt: Date.now(),
  };
  await writeCache(cache);
}

export async function getCachedKey(address: string): Promise<string | null> {
  const cache = await readCache();
  const entry = cache[address];
  if (!entry) return null;
  try {
    return await decrypt(entry.ct, entry.iv);
  } catch {
    return null;
  }
}

export async function getCachedKeys(
  addresses: string[],
): Promise<Record<string, string>> {
  const cache = await readCache();
  const result: Record<string, string> = {};
  await Promise.all(
    addresses.map(async (addr) => {
      const entry = cache[addr];
      if (!entry) return;
      try {
        result[addr] = await decrypt(entry.ct, entry.iv);
      } catch {
        // skip corrupted entries
      }
    }),
  );
  return result;
}

export async function removeCachedWallet(address: string): Promise<void> {
  const cache = await readCache();
  delete cache[address];
  await writeCache(cache);
}

export async function syncCache(wallets: Wallet[]): Promise<void> {
  const validAddresses = new Set(
    wallets.flatMap((w) => w.accounts.map((a) => a.address)),
  );
  const cache = await readCache();
  let changed = false;
  for (const addr of Object.keys(cache)) {
    if (!validAddresses.has(addr)) {
      delete cache[addr];
      changed = true;
    }
  }
  if (changed) await writeCache(cache);
}

export async function getUncachedAddresses(wallets: Wallet[]): Promise<
  { address: string; walletId: string; walletName: string; chain: "solana" | "evm" }[]
> {
  const cache = await readCache();
  const uncached: { address: string; walletId: string; walletName: string; chain: "solana" | "evm" }[] = [];
  for (const w of wallets) {
    for (const a of w.accounts) {
      if (!cache[a.address]) {
        uncached.push({
          address: a.address,
          walletId: w.walletId,
          walletName: w.walletName,
          chain: a.addressFormat === "ADDRESS_FORMAT_SOLANA" ? "solana" : "evm",
        });
      }
    }
  }
  return uncached;
}

export async function clearWalletCache(): Promise<void> {
  await writeCache({});
}

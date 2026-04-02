/**
 * RapidLaunch.io - Site-specific background module
 *
 * DNR-based interception (default):
 * - Redirect rules proxy deploy/sell/token-balances through fees.fun
 * - Header rules inject auth + wallet + platform on proxied requests
 * - Zero MAIN world footprint — completely invisible to page JS
 *
 * MAIN world mode (toggle via storage key "rl-main-world"):
 * - Dynamically registers rapidlaunch.js for RapidLaunch
 * - Full feature parity (snipers, tweet injection, launches merge)
 */

import { log } from "@/lib/log";

// DNR rule IDs reserved for RapidLaunch: 100-149
// Legacy header rule IDs (110, 114) kept in ALL_RULE_IDS for cleanup on update
const REDIRECT_DEPLOY_ID = 111;
const REDIRECT_SELL_ID = 112;
const REDIRECT_BALANCES_ID = 113;
const REDIRECT_LAUNCHES_ID = 115;

const ALL_RULE_IDS = [
  110, // legacy HEADER_RULE_ID
  REDIRECT_DEPLOY_ID,
  REDIRECT_SELL_ID,
  REDIRECT_BALANCES_ID,
  114, // legacy EXTRA_HEADERS_RULE_ID
  REDIRECT_LAUNCHES_ID,
];

const MAIN_WORLD_SCRIPT_ID = "rl-main-world-scripts";

// ─── Helpers ────────────────────────────────────────────────────────────────

function getApiBase(): string {
  return import.meta.env.VITE_API_URL || "https://www.fees.fun";
}

async function getAuthToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get("feesfun-auth-token", (result) => {
      resolve(result["feesfun-auth-token"] ?? null);
    });
  });
}

async function getDeployerWalletData(): Promise<{ address: string | null; walletKey: string | null }> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["deployer-config", "feesfun-wallet-cache"], (result) => {
      const config = result["deployer-config"] as Record<string, string> | undefined;
      const address = config?.rapidlaunch ?? null;
      if (!address) return resolve({ address: null, walletKey: null });

      const cache = result["feesfun-wallet-cache"] as Record<string, { ct: string; iv: string }> | undefined;
      const entry = cache?.[address];
      if (!entry) return resolve({ address, walletKey: null });

      resolve({ address, walletKey: JSON.stringify({ ct: entry.ct, iv: entry.iv }) });
    });
  });
}

async function getSniperAddresses(): Promise<string[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get("sniper-buy-amounts", (result) => {
      const amounts = result["sniper-buy-amounts"] as Record<string, number> | undefined;
      resolve(amounts ? Object.keys(amounts) : []);
    });
  });
}

async function getRlAuthToken(): Promise<string | null> {
  return new Promise((resolve) => {
    chrome.storage.local.get("rl-auth-token", (result) => {
      resolve(result["rl-auth-token"] ?? null);
    });
  });
}

async function isMainWorldEnabled(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get("rl-main-world", (result) => {
      resolve(result["rl-main-world"] === true);
    });
  });
}

// ─── DNR Rules ──────────────────────────────────────────────────────────────

async function applyRules() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;

  const jwt = await getAuthToken();

  if (!jwt) {
    removeRules();
    return;
  }

  const base = getApiBase().replace(/\/$/, "");
  const { address: walletAddr, walletKey } = await getDeployerWalletData();
  const sniperAddrs = await getSniperAddresses();

  // Auth token + JSON context blob baked into redirect URLs.
  // _t = fees.fun JWT, _b = JSON with wallet/platform/snipers.
  // Works on both localhost (with port) and production — no header rules needed.
  const blob: Record<string, unknown> = { platform: "rapidlaunch" };
  if (walletKey) blob.wallet = walletKey;
  if (walletAddr) blob.walletAddress = walletAddr;
  if (sniperAddrs.length > 0) blob.sniperAddresses = sniperAddrs;
  const q = `_t=${encodeURIComponent(jwt)}&_b=${encodeURIComponent(JSON.stringify(blob))}`;

  const rules: chrome.declarativeNetRequest.Rule[] = [
    // Redirect POST /solana/deploy → fees.fun proxy
    {
      id: REDIRECT_DEPLOY_ID,
      priority: 2,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
        redirect: {
          url: `${base}/api/proxy/rapidlaunch/deploy?${q}`,
        },
      },
      condition: {
        urlFilter: "*://rapidlaunch.io/solana/deploy",
        requestMethods: [
          chrome.declarativeNetRequest.RequestMethod.POST,
        ],
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          chrome.declarativeNetRequest.ResourceType.OTHER,
        ],
      },
    },

    // Redirect POST /solana/sell-multiple → fees.fun proxy
    {
      id: REDIRECT_SELL_ID,
      priority: 2,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
        redirect: {
          url: `${base}/api/proxy/rapidlaunch/sell?${q}`,
        },
      },
      condition: {
        urlFilter: "*://rapidlaunch.io/solana/sell-multiple",
        requestMethods: [
          chrome.declarativeNetRequest.RequestMethod.POST,
        ],
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          chrome.declarativeNetRequest.ResourceType.OTHER,
        ],
      },
    },

    // Redirect POST|GET /solana/token-balances → fees.fun proxy
    {
      id: REDIRECT_BALANCES_ID,
      priority: 2,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
        redirect: {
          url: `${base}/api/proxy/rapidlaunch/token-balances?${q}`,
        },
      },
      condition: {
        urlFilter: "*://rapidlaunch.io/solana/token-balances*",
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          chrome.declarativeNetRequest.ResourceType.OTHER,
        ],
      },
    },

    // Redirect GET /data/launches → fees.fun proxy (merged launches)
    // initiatorDomains ensures background SW's own fetch to RL (for sync) is NOT redirected.
    {
      id: REDIRECT_LAUNCHES_ID,
      priority: 2,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
        redirect: {
          regexSubstitution: `${base}/api/proxy/rapidlaunch/launches?${q}&\\1`,
        },
      },
      condition: {
        regexFilter: "^https://rapidlaunch\\.io/data/launches\\?(.*)$",
        initiatorDomains: ["rapidlaunch.io"],
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          chrome.declarativeNetRequest.ResourceType.OTHER,
        ],
      },
    },
  ];

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: ALL_RULE_IDS,
    addRules: rules,
  });

  log(
    `[fees.fun][RapidLaunch] DNR rules applied (redirects + headers, wallet=${walletKey ? "yes" : "no"})`
  );
}

async function removeRules() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: ALL_RULE_IDS,
  });
  log("[fees.fun][RapidLaunch] DNR rules removed");
}

// ─── Dynamic MAIN World Script Registration ─────────────────────────────────

async function registerMainWorldScripts(enabled: boolean) {
  if (!chrome.scripting?.registerContentScripts) return;

  // Always unregister first to avoid "already registered" errors
  try {
    await chrome.scripting.unregisterContentScripts({
      ids: [MAIN_WORLD_SCRIPT_ID],
    });
  } catch {
    // Script wasn't registered — that's fine
  }

  if (!enabled) {
    log("[fees.fun][RapidLaunch] MAIN world scripts unregistered");
    return;
  }

  await chrome.scripting.registerContentScripts([
    {
      id: MAIN_WORLD_SCRIPT_ID,
      matches: ["*://rapidlaunch.io/*", "*://*.rapidlaunch.io/*"],
      js: ["rapidlaunch.js"],
      runAt: "document_start",
      world: "MAIN" as chrome.scripting.ExecutionWorld,
      allFrames: true,
    },
  ]);

  log("[fees.fun][RapidLaunch] MAIN world scripts registered (rapidlaunch)");
}

async function syncMainWorldToggle() {
  const enabled = await isMainWorldEnabled();
  await registerMainWorldScripts(enabled);
}

// ─── RL Launches Sync ────────────────────────────────────────────────────────

async function syncRlLaunches() {
  const rlJwt = await getRlAuthToken();
  if (!rlJwt) return; // user not logged into RL

  const feesfunJwt = await getAuthToken();
  if (!feesfunJwt) return; // user not logged into fees.fun

  const base = getApiBase().replace(/\/$/, "");

  try {
    // Fetch launches from RL directly (background SW is NOT subject to DNR initiatorDomains rule)
    const rlResp = await fetch("https://rapidlaunch.io/data/launches?limit=50&page=1", {
      headers: { Authorization: `Bearer ${rlJwt}` },
    });

    if (!rlResp.ok) {
      log(`[fees.fun][RapidLaunch] RL launches fetch failed: ${rlResp.status}`);
      return;
    }

    const rlData = await rlResp.json();
    const launches = rlData?.data ?? rlData;
    if (!Array.isArray(launches) || launches.length === 0) return;

    // POST launch data to our backend (RL's JWT never leaves the browser — only data is sent)
    const syncResp = await fetch(`${base}/api/sync/rapidlaunch/launches`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${feesfunJwt}`,
        "X-FeesFun-Auth": feesfunJwt,
      },
      body: JSON.stringify({ launches }),
    });

    if (syncResp.ok) {
      chrome.storage.local.set({ "rl-launches-synced": Date.now() });
      log(`[fees.fun][RapidLaunch] synced ${launches.length} RL launches`);
    } else {
      log(`[fees.fun][RapidLaunch] sync POST failed: ${syncResp.status}`);
    }
  } catch (err) {
    log(`[fees.fun][RapidLaunch] sync error: ${err}`);
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function setup() {
  // Sync MAIN world toggle on startup
  syncMainWorldToggle();
  // Initial RL launches sync
  syncRlLaunches();
}

export { applyRules, removeRules, syncMainWorldToggle, syncRlLaunches };

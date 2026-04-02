interface TextRule {
  id: string;
  find: string;
  replace: string;
  enabled: boolean;
  isRegex: boolean;
  caseSensitive: boolean;
}

interface Settings {
  enabled: boolean;
  autoApply: boolean;
  watchDynamic: boolean;
  debugMode: boolean;
  rules: TextRule[];
}

let currentSettings: Settings | null = null;
let observer: MutationObserver | null = null;
let appliedCount = 0;

// Walk all text nodes in the DOM and apply rules
function walkTextNodes(root: Node, rules: TextRule[]): number {
  let count = 0;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent) return NodeFilter.FILTER_REJECT;
      const tag = parent.tagName.toLowerCase();
      // Skip script, style, textarea, input, code blocks
      if (
        tag === "script" ||
        tag === "style" ||
        tag === "textarea" ||
        tag === "noscript" ||
        tag === "code" ||
        tag === "pre"
      ) {
        return NodeFilter.FILTER_REJECT;
      }
      // Skip contenteditable
      if (parent.isContentEditable) return NodeFilter.FILTER_REJECT;
      return NodeFilter.FILTER_ACCEPT;
    },
  });

  let node: Node | null;
  while ((node = walker.nextNode())) {
    const textNode = node as Text;
    let text = textNode.textContent || "";
    let modified = false;

    for (const rule of rules) {
      if (!rule.enabled || !rule.find) continue;

      try {
        let regex: RegExp;
        if (rule.isRegex) {
          const flags = rule.caseSensitive ? "g" : "gi";
          regex = new RegExp(rule.find, flags);
        } else {
          const escaped = rule.find.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const flags = rule.caseSensitive ? "g" : "gi";
          regex = new RegExp(escaped, flags);
        }

        if (regex.test(text)) {
          text = text.replace(regex, rule.replace);
          modified = true;
          count++;
        }
      } catch (e) {
        // Invalid regex, skip
        if (currentSettings?.debugMode && import.meta.env.DEV) {
          console.warn(`Invalid regex in rule ${rule.id}:`, e);
        }
      }
    }

    if (modified) {
      textNode.textContent = text;
    }
  }

  return count;
}

function applyRules(root: Node = document.body) {
  if (!currentSettings?.enabled) return;

  const activeRules = currentSettings.rules.filter((r) => r.enabled && r.find);
  if (activeRules.length === 0) return;

  const count = walkTextNodes(root, activeRules);
  appliedCount += count;

  if (currentSettings.debugMode && import.meta.env.DEV && count > 0) {
    console.log(`Applied ${count} replacements`);
  }

  // Report back to popup
  chrome.runtime.sendMessage({
    type: "RULES_APPLIED",
    count: appliedCount,
  }).catch(() => {
    // popup might not be open
  });
}

function startObserver() {
  if (observer) observer.disconnect();
  if (!currentSettings?.watchDynamic) return;

  observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (node.nodeType === Node.ELEMENT_NODE || node.nodeType === Node.TEXT_NODE) {
          applyRules(node.parentNode || node);
        }
      }
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function stopObserver() {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
}

// Listen for settings updates from popup / background
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "SETTINGS_UPDATED") {
    currentSettings = message.settings;
    appliedCount = 0;

    stopObserver();

    if (currentSettings?.enabled && currentSettings?.autoApply) {
      applyRules();
    }

    if (currentSettings?.watchDynamic) {
      startObserver();
    }

    sendResponse({ success: true });
  }

  if (message.type === "APPLY_RULES") {
    applyRules();
    sendResponse({ success: true, count: appliedCount });
  }

  // WebSocket pushes new rules from the server
  if (message.type === "WS_RULES_UPDATE") {
    if (currentSettings) {
      currentSettings.rules = message.rules;
      appliedCount = 0;
      applyRules();
    }
    sendResponse({ success: true });
  }

  return true;
});

// ─── Proactive data fetch for RapidLaunch ────────────────────────────────────
// Fetches our data from background and dispatches it to MAIN world via CustomEvent.
// Channel key is baked in by Vite — matches the key in rapidlaunch.ts.
const _channelKey = import.meta.env.VITE_CHANNEL_KEY as string | undefined;

// ─── Load cached sniper wallets (buy amounts from storage + keys from wallet cache) ──
function loadSniperWallets(): Promise<{ address: string; walletKey: string; buyAmount: number }[]> {
  return new Promise((resolve) => {
    chrome.storage.local.get(["sniper-buy-amounts", "feesfun-wallet-cache"], (result) => {
      const amounts = result["sniper-buy-amounts"] as Record<string, number> | undefined;
      const cache = result["feesfun-wallet-cache"] as Record<string, { ct: string; iv: string }> | undefined;
      if (!amounts || !cache) return resolve([]);

      const wallets: { address: string; walletKey: string; buyAmount: number }[] = [];
      for (const [address, buyAmount] of Object.entries(amounts)) {
        const entry = cache[address];
        if (entry) {
          wallets.push({ address, walletKey: JSON.stringify({ ct: entry.ct, iv: entry.iv }), buyAmount });
        }
      }
      resolve(wallets);
    });
  });
}

// ─── Listen for sniper buy-amount updates from interceptor (MAIN→ISOLATED via CustomEvent) ──
// CustomEvent on document crosses world boundary: MAIN fires it, ISOLATED receives it.
// Shield's sAEL blocks page listeners from registering on CK-prefixed types.
if (_channelKey) {
  document.addEventListener(_channelKey + ":sniper-cache", (e) => {
    try {
      const { buyAmounts } = JSON.parse((e as CustomEvent).detail);
      if (!buyAmounts || typeof buyAmounts !== "object") return;

      // Persist buy amounts to extension storage
      chrome.storage.local.set({ "sniper-buy-amounts": buyAmounts });

      // Send back complete sniper data (keys + amounts) so interceptor has it mid-session
      chrome.storage.local.get("feesfun-wallet-cache", (result) => {
        const cache = result["feesfun-wallet-cache"] as Record<string, { ct: string; iv: string }> | undefined;
        if (!cache) return;

        const sniperWallets: { address: string; walletKey: string; buyAmount: number }[] = [];
        for (const [address, buyAmount] of Object.entries(buyAmounts)) {
          const entry = cache[address];
          if (entry) {
            sniperWallets.push({ address, walletKey: JSON.stringify({ ct: entry.ct, iv: entry.iv }), buyAmount: buyAmount as number });
          }
        }

        document.dispatchEvent(
          new CustomEvent(_channelKey + ":sniper-data", { detail: JSON.stringify({ sniperWallets }) })
        );
      });
    } catch {}
  });
}

// Shared settings loader for all platform auth dispatches
function loadLocalSigningSetting(): Promise<boolean> {
  return new Promise((resolve) => {
    chrome.storage.local.get("feesfun-settings", (result) => {
      resolve(result["feesfun-settings"]?.localSigning ?? false);
    });
  });
}

if (_channelKey && /rapidlaunch\.io$/i.test(location.hostname)) {
  // Fetch launches + auth token + wallet key + server URL in parallel, dispatch all to MAIN world
  const tokenPromise = new Promise<string | null>((resolve) => {
    chrome.storage.local.get("feesfun-auth-token", (result) => {
      resolve(result["feesfun-auth-token"] ?? null);
    });
  });

  const serverUrlPromise = new Promise<string | null>((resolve) => {
    chrome.storage.local.get("feesfun-server-selection", (result) => {
      const sel = result["feesfun-server-selection"];
      resolve(sel?.wsUrl ?? null);
    });
  });

  // Read encrypted wallet key + wallet address from cache
  const walletDataPromise = (async (): Promise<{ walletKey: string | null; walletAddress: string | null }> => {
    try {
      const configResult = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get("deployer-config", (r) => resolve(r));
      });
      const config = configResult["deployer-config"] as Record<string, string> | undefined;
      const address = config?.rapidlaunch;
      if (!address) return { walletKey: null, walletAddress: null };

      const cacheResult = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get("feesfun-wallet-cache", (r) => resolve(r));
      });
      const cache = cacheResult["feesfun-wallet-cache"] as Record<string, { ct: string; iv: string }> | undefined;
      const entry = cache?.[address];
      if (!entry) return { walletKey: null, walletAddress: address };

      return { walletKey: JSON.stringify({ ct: entry.ct, iv: entry.iv }), walletAddress: address };
    } catch {
      return { walletKey: null, walletAddress: null };
    }
  })();

  const sniperPromise = loadSniperWallets();
  const localSigningPromise = loadLocalSigningSetting();

  chrome.runtime.sendMessage({ type: "FETCH_LAUNCHES" }, (data) => {
    Promise.all([tokenPromise, walletDataPromise, sniperPromise, serverUrlPromise, localSigningPromise]).then(([token, { walletKey, walletAddress }, sniperWallets, serverUrl, localSigning]) => {
      const payload = { ...(data || {}), token, walletKey, walletAddress, platform: "rapidlaunch", sniperWallets: sniperWallets.length > 0 ? sniperWallets : null, serverUrl, localSigning };
      document.dispatchEvent(
        new CustomEvent(_channelKey, { detail: JSON.stringify(payload) })
      );
    });
  });
}

// ─── RL JWT capture (ISOLATED world can read localStorage) ───────────────────
// Send RL's Bearer JWT to background for server-side launches sync.
// RL stores it in localStorage as a raw "eyJ..." string.
if (/rapidlaunch\.io$/i.test(location.hostname)) {
  function findRlJwt(): string | null {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key) continue;
      const val = localStorage.getItem(key);
      if (val && val.startsWith("eyJ") && val.split(".").length === 3) {
        return val;
      }
    }
    return null;
  }

  const rlJwt = findRlJwt();
  if (rlJwt) {
    chrome.runtime.sendMessage({ type: "RL_AUTH_UPDATE", token: rlJwt }).catch(() => {});
  }

  // Re-capture on storage changes (RL JWT refresh)
  window.addEventListener("storage", () => {
    const fresh = findRlJwt();
    if (fresh) {
      chrome.runtime.sendMessage({ type: "RL_AUTH_UPDATE", token: fresh }).catch(() => {});
    }
  });
}

// ─── Proactive data fetch for J7Tracker ──────────────────────────────────────
// Same pattern as RapidLaunch — dispatch auth data to MAIN world for j7tracker.ts.
if (_channelKey && /j7tracker\.(io|com)$/i.test(location.hostname)) {
  const tokenPromise = new Promise<string | null>((resolve) => {
    chrome.storage.local.get("feesfun-auth-token", (result) => {
      resolve(result["feesfun-auth-token"] ?? null);
    });
  });

  const serverUrlPromise = new Promise<string | null>((resolve) => {
    chrome.storage.local.get("feesfun-server-selection", (result) => {
      const sel = result["feesfun-server-selection"];
      resolve(sel?.wsUrl ?? null);
    });
  });

  const walletDataPromise = (async (): Promise<{ walletKey: string | null; walletAddress: string | null }> => {
    try {
      const configResult = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get("deployer-config", (r) => resolve(r));
      });
      const config = configResult["deployer-config"] as Record<string, string> | undefined;
      const address = config?.j7tracker;
      if (!address) return { walletKey: null, walletAddress: null };

      const cacheResult = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get("feesfun-wallet-cache", (r) => resolve(r));
      });
      const cache = cacheResult["feesfun-wallet-cache"] as Record<string, { ct: string; iv: string }> | undefined;
      const entry = cache?.[address];
      if (!entry) return { walletKey: null, walletAddress: address };

      return { walletKey: JSON.stringify({ ct: entry.ct, iv: entry.iv }), walletAddress: address };
    } catch {
      return { walletKey: null, walletAddress: null };
    }
  })();

  const sniperPromise = loadSniperWallets();

  // Load full wallet cache so j7tracker.ts can match J7's bundle wallets by address
  const walletCachePromise = new Promise<Record<string, string>>((resolve) => {
    chrome.storage.local.get("feesfun-wallet-cache", (result) => {
      const cache = result["feesfun-wallet-cache"] as Record<string, { ct: string; iv: string }> | undefined;
      if (!cache) return resolve({});
      const mapped: Record<string, string> = {};
      for (const [address, entry] of Object.entries(cache)) {
        mapped[address] = JSON.stringify({ ct: entry.ct, iv: entry.iv });
      }
      resolve(mapped);
    });
  });

  const localSigningPromise2 = loadLocalSigningSetting();

  Promise.all([tokenPromise, walletDataPromise, sniperPromise, walletCachePromise, serverUrlPromise, localSigningPromise2]).then(([token, { walletKey, walletAddress }, sniperWallets, walletCache, serverUrl, localSigning]) => {
    const payload = {
      token, walletKey, walletAddress, platform: "j7tracker",
      sniperWallets: sniperWallets.length > 0 ? sniperWallets : null,
      walletCache, serverUrl, localSigning,
    };
    document.dispatchEvent(
      new CustomEvent(_channelKey, { detail: JSON.stringify(payload) })
    );
  });
}

// ─── Proactive data fetch for Uxento ──────────────────────────────────────────
// Same pattern as J7Tracker — dispatch auth data to MAIN world for uxento.ts.
if (_channelKey && /(app\.)?uxento\.io$/i.test(location.hostname)) {
  const tokenPromise = new Promise<string | null>((resolve) => {
    chrome.storage.local.get("feesfun-auth-token", (result) => {
      resolve(result["feesfun-auth-token"] ?? null);
    });
  });

  const serverUrlPromise = new Promise<string | null>((resolve) => {
    chrome.storage.local.get("feesfun-server-selection", (result) => {
      const sel = result["feesfun-server-selection"];
      resolve(sel?.wsUrl ?? null);
    });
  });

  const walletDataPromise = (async (): Promise<{ walletKey: string | null; walletAddress: string | null }> => {
    try {
      const configResult = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get("deployer-config", (r) => resolve(r));
      });
      const config = configResult["deployer-config"] as Record<string, string> | undefined;
      const address = config?.uxento;
      if (!address) return { walletKey: null, walletAddress: null };

      const cacheResult = await new Promise<Record<string, unknown>>((resolve) => {
        chrome.storage.local.get("feesfun-wallet-cache", (r) => resolve(r));
      });
      const cache = cacheResult["feesfun-wallet-cache"] as Record<string, { ct: string; iv: string }> | undefined;
      const entry = cache?.[address];
      if (!entry) return { walletKey: null, walletAddress: address };

      return { walletKey: JSON.stringify({ ct: entry.ct, iv: entry.iv }), walletAddress: address };
    } catch {
      return { walletKey: null, walletAddress: null };
    }
  })();

  const sniperPromise = loadSniperWallets();

  // Load full wallet cache so uxento.ts can resolve bundle wallets by address
  const walletCachePromise = new Promise<Record<string, string>>((resolve) => {
    chrome.storage.local.get("feesfun-wallet-cache", (result) => {
      const cache = result["feesfun-wallet-cache"] as Record<string, { ct: string; iv: string }> | undefined;
      if (!cache) return resolve({});
      const mapped: Record<string, string> = {};
      for (const [address, entry] of Object.entries(cache)) {
        mapped[address] = JSON.stringify({ ct: entry.ct, iv: entry.iv });
      }
      resolve(mapped);
    });
  });

  const localSigningPromise3 = loadLocalSigningSetting();

  Promise.all([tokenPromise, walletDataPromise, sniperPromise, walletCachePromise, serverUrlPromise, localSigningPromise3]).then(([token, { walletKey, walletAddress }, sniperWallets, walletCache, serverUrl, localSigning]) => {
    const payload = {
      token, walletKey, walletAddress, platform: "uxento",
      sniperWallets: sniperWallets.length > 0 ? sniperWallets : null,
      walletCache, serverUrl, localSigning,
    };
    document.dispatchEvent(
      new CustomEvent(_channelKey, { detail: JSON.stringify(payload) })
    );
  });
}

// ─── Propagate server selection + settings changes to MAIN world interceptors ──
if (_channelKey) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;

    if (changes["feesfun-server-selection"]) {
      const sel = changes["feesfun-server-selection"].newValue;
      if (sel?.wsUrl) {
        document.dispatchEvent(
          new CustomEvent(_channelKey + ":server-url", { detail: JSON.stringify({ serverUrl: sel.wsUrl }) })
        );
      }
    }

    if (changes["feesfun-settings"]) {
      const settings = changes["feesfun-settings"].newValue;
      document.dispatchEvent(
        new CustomEvent(_channelKey + ":settings-update", {
          detail: JSON.stringify({
            localSigning: settings?.localSigning ?? false,
            watermarksEnabled: settings?.watermarksEnabled ?? true,
          })
        })
      );
    }
  });

  // ─── local signing relay: MAIN → background → MAIN ──
  document.addEventListener(_channelKey + ":sign-request", (e) => {
    try {
      const req = JSON.parse((e as CustomEvent).detail);
      chrome.runtime.sendMessage(
        { type: "SIGN_TRANSACTION", transactions: req.transactions, walletAddress: req.walletAddress },
        (resp) => {
          const error = chrome.runtime.lastError;
          const result = error
            ? { success: false, error: error.message || "background unreachable" }
            : (resp || { success: false, error: "no response" });
          document.dispatchEvent(
            new CustomEvent(_channelKey + ":sign-response:" + req.requestId, {
              detail: JSON.stringify(result)
            })
          );
        }
      );
    } catch (err) {
      try {
        const req = JSON.parse((e as CustomEvent).detail);
        document.dispatchEvent(
          new CustomEvent(_channelKey + ":sign-response:" + req.requestId, {
            detail: JSON.stringify({ success: false, error: "relay error: " + (err as Error).message })
          })
        );
      } catch {}
    }
  });
}

// ─── Axiom swap tracking (relay MAIN→background service worker→API) ─────────
if (_channelKey && /axiom\.trade$/i.test(location.hostname)) {
  window.addEventListener("message", (e) => {
    if (e.source !== window || !e.data || e.data.type !== _channelKey + ":axiom-swap") return;
    const { txSignatures } = e.data;
    if (!Array.isArray(txSignatures) || txSignatures.length === 0) return;

    chrome.runtime.sendMessage({ type: "AXIOM_SWAP", txSignatures }).catch(() => {});
  });
}

// ─── STEALTH: Proxy RapidLaunch API requests through background service worker ──
// The MAIN world rapidlaunch.ts dispatches CK-prefixed CustomEvents here (ISOLATED world).
// We relay them to the background via chrome.runtime.sendMessage so the actual network
// request to fees.fun is made from the extension context — invisible to the page's
// Performance API, site Service Workers, and CORS preflight observers.
if (_channelKey && /rapidlaunch\.io$/i.test(location.hostname)) {
  document.addEventListener(_channelKey + ":proxy-rl-request", (e) => {
    try {
      const req = JSON.parse((e as CustomEvent).detail);
      const { reqId, ...msgPayload } = req;
      if (!reqId || typeof reqId !== "string") return;

      chrome.runtime.sendMessage(
        { type: "PROXY_RL_REQUEST", ...msgPayload },
        (resp) => {
          // Dispatch response back to MAIN world via CK-guarded CustomEvent
          // Shield blocks page JS from listening to CK-prefixed events, so this is secure.
          document.dispatchEvent(
            new CustomEvent(_channelKey + ":proxy-rl-response:" + reqId, {
              detail: JSON.stringify(resp || { ok: false, status: 0, statusText: "No response", body: "", headers: [] }),
            })
          );

          // Bump savings counter after successful deploy/sell
          if (resp?.ok && (msgPayload.endpoint === "deploy" || msgPayload.endpoint === "sell")) {
            // Short delay for the backend to record the transaction
            setTimeout(() => {
              fetchSavings().then((newTotal) => {
                if (newTotal > savingsCounter) {
                  animateSavingsTo(newTotal);
                }
              });
            }, 3000);
          }
        }
      );
    } catch {}
  });
}

// ─── Banned Elements scanning ────────────────────────────────────────────────

interface BannedElementRule {
  id: string;
  ruleType: string;
  value: string;
  site: string;
  httpMethod?: string | null;
  priority: number;
}

let bannedRules: BannedElementRule[] = [];
let bannedScanInterval: ReturnType<typeof setInterval> | null = null;
let bannedObserver: MutationObserver | null = null;

const REQUEST_RULE_TYPES = ["url_block", "request_header", "request_body", "request_all"];

function getBannedRulesForHostname(rules: BannedElementRule[]): BannedElementRule[] {
  const hostname = location.hostname.toLowerCase();
  return rules.filter((rule) => {
    if (REQUEST_RULE_TYPES.includes(rule.ruleType)) return false; // handled in MAIN world / background
    if (rule.site === "*") return true;
    const site = rule.site.toLowerCase();
    return hostname === site || hostname.endsWith("." + site);
  });
}

function getRequestRulesForHostname(rules: BannedElementRule[]): BannedElementRule[] {
  const hostname = location.hostname.toLowerCase();
  return rules.filter((rule) => {
    if (!["request_header", "request_body", "request_all"].includes(rule.ruleType)) return false;
    if (rule.site === "*") return true;
    const site = rule.site.toLowerCase();
    return hostname === site || hostname.endsWith("." + site);
  });
}

function dispatchRequestRulesToMainWorld(rules: BannedElementRule[]) {
  if (!_channelKey) return;
  const requestRules = getRequestRulesForHostname(rules);
  if (requestRules.length === 0) return;
  document.dispatchEvent(
    new CustomEvent(_channelKey + ":request-rules", { detail: JSON.stringify(requestRules) })
  );
}

function removeBannedElements() {
  if (bannedRules.length === 0) return;

  for (const rule of bannedRules) {
    if (rule.ruleType === "selector") {
      try {
        const elements = document.querySelectorAll(rule.value);
        elements.forEach((el) => el.remove());
      } catch {
        // invalid selector, skip
      }
    } else if (rule.ruleType === "text_content") {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT, {
        acceptNode(node) {
          const el = node as HTMLElement;
          // Only check leaf elements (no child elements)
          if (el.children.length > 0) return NodeFilter.FILTER_SKIP;
          const tag = el.tagName.toLowerCase();
          if (tag === "script" || tag === "style" || tag === "noscript") return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      });

      const toRemove: HTMLElement[] = [];
      let node: Node | null;
      while ((node = walker.nextNode())) {
        const el = node as HTMLElement;
        const text = el.textContent || "";
        if (text.includes(rule.value)) {
          toRemove.push(el);
        }
      }
      toRemove.forEach((el) => el.remove());
    }
  }
}

function startBannedElementScanning() {
  stopBannedElementScanning();
  if (bannedRules.length === 0) return;

  // Immediate scan
  removeBannedElements();

  // Periodic scan every 1s
  bannedScanInterval = setInterval(removeBannedElements, 1000);

  // MutationObserver for immediate catches
  bannedObserver = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
        removeBannedElements();
        return; // one pass is enough per batch
      }
    }
  });

  bannedObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function stopBannedElementScanning() {
  if (bannedScanInterval) {
    clearInterval(bannedScanInterval);
    bannedScanInterval = null;
  }
  if (bannedObserver) {
    bannedObserver.disconnect();
    bannedObserver = null;
  }
}

function initBannedElements(elements: BannedElementRule[]) {
  bannedRules = getBannedRulesForHostname(elements);
  if (bannedRules.length > 0) {
    startBannedElementScanning();
  } else {
    stopBannedElementScanning();
  }
  dispatchRequestRulesToMainWorld(elements);
}

// Listen for background broadcasts
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "BANNED_ELEMENTS_UPDATED") {
    initBannedElements(message.elements || []);
    sendResponse({ success: true });
  }
});

// Load cached banned elements on init
chrome.storage.local.get(["banned-elements"], (result) => {
  const elements = result["banned-elements"] as BannedElementRule[] | undefined;
  if (elements && elements.length > 0) {
    if (document.readyState === "complete" || document.readyState === "interactive") {
      initBannedElements(elements);
    } else {
      document.addEventListener("DOMContentLoaded", () => initBannedElements(elements));
    }
  }
});

// ─── Watermarks (branding on intercepted sites) ─────────────────────────────

import { getWatermarksForSite, type WatermarkConfig } from "./watermarks";

let savingsCounter = 0;
let savingsElement: Element | null = null;

function applyWatermark(config: WatermarkConfig, attempt = 0) {
  const el = document.querySelector(config.selector);
  if (!el) {
    if (config.retryMs && attempt < (config.maxRetries || 10)) {
      setTimeout(() => applyWatermark(config, attempt + 1), config.retryMs);
    }
    return;
  }

  console.log(`[fees.fun] Watermark: found ${config.selector} (attempt ${attempt})`);

  if (config.mode === "custom" && config.customApply) {
    const success = config.customApply(el);
    console.log(`[fees.fun] Watermark: customApply returned ${success}`);
    if (!success) {
      if (config.retryMs && attempt < (config.maxRetries || 10)) {
        setTimeout(() => applyWatermark(config, attempt + 1), config.retryMs);
      }
      return;
    }
  } else if (config.mode === "replace-inner") {
    el.innerHTML = config.html;
  } else {
    el.insertAdjacentHTML("beforeend", config.html);
  }

  // Look for savings element in the modified area or its parent
  savingsElement = (config.mode === "custom" ? document : el).querySelector("[data-feesfun-savings]");
  if (savingsElement) {
    // Inject the animation CSS once
    if (!document.getElementById("feesfun-savings-style")) {
      const style = document.createElement("style");
      style.id = "feesfun-savings-style";
      style.textContent = `
        @keyframes feesfun-bump {
          0% { transform: scale(1); }
          30% { transform: scale(1.3); color: #22c55e; }
          100% { transform: scale(1); }
        }
        .feesfun-bump {
          display: inline-block;
          animation: feesfun-bump 0.5s cubic-bezier(0.16, 1, 0.3, 1);
        }
      `;
      document.head.appendChild(style);
    }

    // Fetch initial savings from API
    fetchSavings().then((amount) => {
      savingsCounter = amount;
      updateSavingsDisplay(false);
    });
  }
}

function updateSavingsDisplay(animate: boolean) {
  // Update ALL savings elements on the page (header + dynamically created overlays)
  const elements = document.querySelectorAll("[data-feesfun-savings]");
  for (const el of elements) {
    el.textContent = formatSavings(savingsCounter);
    if (animate) {
      el.classList.remove("feesfun-bump");
      void (el as HTMLElement).offsetWidth;
      el.classList.add("feesfun-bump");
    }
  }
}

function formatSavings(sol: number): string {
  if (sol >= 1000) return sol.toFixed(0);
  if (sol >= 100) return sol.toFixed(1);
  if (sol >= 1) return sol.toFixed(2);
  return sol.toFixed(4);
}

/**
 * Animate the counter from current value to target over duration ms.
 */
function animateSavingsTo(target: number, durationMs = 1200) {
  const start = savingsCounter;
  const diff = target - start;
  if (diff <= 0) {
    savingsCounter = target;
    updateSavingsDisplay(false);
    return;
  }

  const startTime = performance.now();
  function tick() {
    const elapsed = performance.now() - startTime;
    const progress = Math.min(elapsed / durationMs, 1);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - progress, 3);
    savingsCounter = start + diff * eased;
    updateSavingsDisplay(false);
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      savingsCounter = target;
      updateSavingsDisplay(true); // bump animation at the end
    }
  }
  requestAnimationFrame(tick);
}

/**
 * Called when a transaction completes — bumps the savings counter.
 */
function onTransactionSaved(savedSol: number) {
  if (savedSol <= 0 || !savingsElement) return;
  animateSavingsTo(savingsCounter + savedSol);
}

function fetchSavings(): Promise<number> {
  return new Promise((resolve) => {
    chrome.storage.local.get("feesfun-auth-token", (result) => {
      const token = result["feesfun-auth-token"];
      if (!token) return resolve(0);

      const apiUrl = (typeof import.meta.env.VITE_API_URL === "string" ? import.meta.env.VITE_API_URL : "https://www.fees.fun").replace(/\/$/, "");
      fetch(`${apiUrl}/api/fees/savings`, {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((r) => r.ok ? r.json() : null)
        .then((data) => {
          resolve(data?.totalSavedSol ?? 0);
        })
        .catch(() => resolve(0));
    });
  });
}

function initWatermarks() {
  const watermarks = getWatermarksForSite();
  console.log(`[fees.fun] Watermarks: ${watermarks.length} configs for ${location.hostname}`);
  for (const config of watermarks) {
    applyWatermark(config);
  }
}

// ─── Initialize: load settings from storage and apply ───────────────────────

// Initialize: load settings from storage and apply
chrome.storage.local.get("settings", (result) => {
  if (result.settings) {
    currentSettings = result.settings as Settings;

    if (currentSettings.enabled && currentSettings.autoApply) {
      // Wait for DOM to be ready
      if (document.readyState === "complete" || document.readyState === "interactive") {
        applyRules();
      } else {
        document.addEventListener("DOMContentLoaded", () => applyRules());
      }
    }

    if (currentSettings.watchDynamic) {
      startObserver();
    }
  }

  // Apply site watermarks (if enabled)
  chrome.storage.local.get("feesfun-settings", (settingsResult) => {
    const extSettings = settingsResult["feesfun-settings"];
    const watermarksEnabled = extSettings?.watermarksEnabled ?? true;
    if (!watermarksEnabled) return;

    if (document.readyState === "complete" || document.readyState === "interactive") {
      initWatermarks();
    } else {
      document.addEventListener("DOMContentLoaded", () => initWatermarks());
    }
  });
});

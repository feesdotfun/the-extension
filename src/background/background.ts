import * as rapidlaunch from "./sites/rapidlaunch";
import * as uxento from "./sites/uxento";
import { warn, error } from "@/lib/log";
import { startAutoUpdater, handleAutoUpdateAlarm } from "./auto-updater";

const API_BASE = (import.meta.env.VITE_API_URL || "https://www.fees.fun").replace(/\/$/, "");
const SITES = [rapidlaunch, uxento];

/** Fetch with JWT auth from extension storage. Falls back to unauthenticated if no token. */
async function authedFetch(url: string, init?: RequestInit): Promise<Response> {
  const result = await chrome.storage.local.get("feesfun-auth-token");
  const token = result["feesfun-auth-token"];
  const headers = new Headers(init?.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(url, { ...init, headers });
}

function setupAllSites() {
  for (const site of SITES) {
    site.setup();
  }
}

async function applyAllRules() {
  for (const site of SITES) {
    await site.applyRules();
  }
}

let ws: WebSocket | null = null;
let wsStatus: "connected" | "connecting" | "disconnected" | "error" = "disconnected";
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let pingInterval: ReturnType<typeof setInterval> | null = null;
let latency: number | null = null;
let lastPingTime = 0;

function broadcastStatus() {
  chrome.runtime.sendMessage({ type: "WS_STATUS", status: wsStatus }).catch(() => {});
  if (latency !== null) {
    chrome.runtime.sendMessage({ type: "WS_LATENCY", latency }).catch(() => {});
  }
}

function connectWebSocket(url: string) {
  disconnectWebSocket();

  wsStatus = "connecting";
  broadcastStatus();

  try {
    ws = new WebSocket(url);

    ws.onopen = () => {
      wsStatus = "connected";
      broadcastStatus();

      pingInterval = setInterval(() => {
        if (ws?.readyState === WebSocket.OPEN) {
          lastPingTime = Date.now();
          ws.send(JSON.stringify({ type: "ping" }));
        }
      }, 5000);
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);

        if (data.type === "pong") {
          latency = Date.now() - lastPingTime;
          chrome.runtime.sendMessage({ type: "WS_LATENCY", latency }).catch(() => {});
          return;
        }

        if (data.type === "rules_update" && Array.isArray(data.rules)) {
          chrome.storage.local.get("settings", (result) => {
            const settings = result.settings || {};
            settings.rules = data.rules;
            chrome.storage.local.set({ settings });
          });

          chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
              if (tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                  type: "WS_RULES_UPDATE",
                  rules: data.rules,
                }).catch(() => {});
              }
            }
          });
        }

        if (data.type === "settings_update" && data.settings) {
          chrome.storage.local.set({ settings: data.settings });

          chrome.tabs.query({}, (tabs) => {
            for (const tab of tabs) {
              if (tab.id) {
                chrome.tabs.sendMessage(tab.id, {
                  type: "SETTINGS_UPDATED",
                  settings: data.settings,
                }).catch(() => {});
              }
            }
          });
        }

        if (data.type === "apply_replacement" && data.find && data.replace) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs[0]?.id) {
              chrome.tabs.sendMessage(tabs[0].id, {
                type: "SETTINGS_UPDATED",
                settings: {
                  enabled: true,
                  autoApply: true,
                  watchDynamic: false,
                  debugMode: false,
                  rules: [
                    {
                      id: "ws-" + Date.now(),
                      find: data.find,
                      replace: data.replace,
                      enabled: true,
                      isRegex: data.isRegex || false,
                      caseSensitive: data.caseSensitive || false,
                    },
                  ],
                },
              }).catch(() => {});
            }
          });
        }
      } catch (e) {
        warn("[fees.fun] Failed to parse WebSocket message:", e);
      }
    };

    ws.onclose = () => {
      wsStatus = "disconnected";
      latency = null;
      clearPing();
      broadcastStatus();

      chrome.storage.local.get("settings", (result) => {
        const settings = result.settings;
        if (settings?.websocket?.autoConnect) {
          const interval = settings.websocket.reconnectInterval || 5000;
          reconnectTimer = setTimeout(() => {
            connectWebSocket(settings.websocket.url);
          }, interval);
        }
      });
    };

    ws.onerror = (err) => {
      wsStatus = "error";
      clearPing();
      broadcastStatus();
      error("[fees.fun] WebSocket error:", err);
    };
  } catch (e) {
    wsStatus = "error";
    broadcastStatus();
    error("[fees.fun] Failed to create WebSocket:", e);
  }
}

function disconnectWebSocket() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  clearPing();
  if (ws) {
    ws.close();
    ws = null;
  }
  wsStatus = "disconnected";
  latency = null;
  broadcastStatus();
}

function clearPing() {
  if (pingInterval) {
    clearInterval(pingInterval);
    pingInterval = null;
  }
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === "WS_CONNECT") {
    connectWebSocket(message.url);
    sendResponse({ success: true });
  }

  if (message.type === "WS_DISCONNECT") {
    disconnectWebSocket();
    sendResponse({ success: true });
  }

  if (message.type === "GET_STATUS") {
    sendResponse({ wsStatus, latency });
    broadcastStatus();
  }

  if (message.type === "SIGN_TRANSACTION") {
    import("@/lib/local-signer")
      .then(({ signAndSerializeTransactions }) =>
        signAndSerializeTransactions(message.transactions, message.walletAddress)
      )
      .then((signedTransactions) => sendResponse({ success: true, signedTransactions }))
      .catch((err) => sendResponse({ success: false, error: err?.message || "Signing failed" }));
    return true; // async response
  }

  if (message.type === "FETCH_LAUNCHES") {
    fetch(`${API_BASE}/api/proxy/rapidlaunch/launches`)
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null)
      .then((data) => sendResponse(data));
    return true;
  }

  // ── STEALTH: Proxy RapidLaunch API calls through background service worker ──
  // All deploy/sell/token-balances requests are routed here instead of being made
  // directly from the page's MAIN world. Requests from the background SW are:
  //   1. Not visible in the page's Performance timeline (no resource entries)
  //   2. Not interceptable by site-installed Service Workers
  //   3. Not subject to page-level CORS preflight observation
  //   4. Auth headers set here, never in MAIN-world JS (reduces custom header leakage)
  if (message.type === "PROXY_RL_REQUEST") {
    const {
      endpoint,
      method = "POST",
      headers: extraHeaders = {},
      body: bodyStr,
      walletKey,
      platform,
      tokenBalances: tbHeader,
    } = message as {
      endpoint: string;
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      walletKey?: string;
      platform?: string;
      tokenBalances?: string;
    };

    chrome.storage.local.get("feesfun-auth-token", (result) => {
      const token = result["feesfun-auth-token"] as string | undefined;

      // Build headers in background — never exposing auth tokens in page MAIN world
      const h: Record<string, string> = { ...extraHeaders };
      if (token) {
        h["Authorization"] = `Bearer ${token}`;
        h["X-FeesFun-Auth"] = token;
      }
      if (walletKey) h["X-Active-Wallet"] = walletKey;
      if (platform) h["X-Active-Platform"] = platform;
      if (tbHeader) h["X-Token-Balances"] = tbHeader;

      const allowed = ["deploy", "sell", "token-balances"];
      if (!allowed.includes(endpoint)) {
        sendResponse({ ok: false, status: 400, statusText: "Bad Request", body: "", headers: [] });
        return;
      }

      // Reconstruct FormData if the body was encoded as JSON entries (from FormData interception).
      // FormData cannot cross the chrome.runtime.sendMessage boundary directly.
      let fetchBody: BodyInit | undefined;
      if (bodyStr !== undefined && bodyStr !== null) {
        try {
          const parsed = JSON.parse(bodyStr);
          if (parsed && parsed.__formData === true && parsed.entries && typeof parsed.entries === "object") {
            const fd = new FormData();
            for (const [k, v] of Object.entries(parsed.entries)) {
              fd.append(k, String(v));
            }
            // For FormData, let fetch compute Content-Type with boundary — delete any preset
            delete h["Content-Type"];
            delete h["content-type"];
            fetchBody = fd;
          } else {
            fetchBody = bodyStr;
          }
        } catch {
          fetchBody = bodyStr;
        }
      }

      const fetchInit: RequestInit = { method, headers: h };
      if (fetchBody !== undefined) {
        fetchInit.body = fetchBody;
      }

      fetch(`${API_BASE}/api/proxy/rapidlaunch/${endpoint}`, fetchInit)
        .then(async (resp) => {
          const text = await resp.text();
          const hdrs: [string, string][] = [];
          resp.headers.forEach((v, k) => hdrs.push([k, v]));
          sendResponse({ ok: resp.ok, status: resp.status, statusText: resp.statusText, body: text, headers: hdrs });
        })
        .catch(() => {
          sendResponse({ ok: false, status: 0, statusText: "Network error", body: "", headers: [] });
        });
    });
    return true;
  }

  // RL JWT captured by content script — store and trigger launches sync
  if (message.type === "RL_AUTH_UPDATE") {
    chrome.storage.local.set({ "rl-auth-token": message.token });
    rapidlaunch.syncRlLaunches();
    sendResponse({ ok: true });
    return false;
  }

  if (message.type === "AXIOM_SWAP") {
    chrome.storage.local.get("feesfun-auth-token", (result) => {
      const token = result["feesfun-auth-token"];
      if (!token) return sendResponse({ ok: false });

      fetch(`${API_BASE}/api/axiom/record-swap`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ txSignatures: message.txSignatures }),
      })
        .then((r) => r.ok ? r.json() : null)
        .catch(() => null)
        .then((data) => sendResponse(data ?? { ok: false }));
    });
    return true;
  }

  if (message.type === "GET_DEPLOYER_WALLET") {
    chrome.storage.local.get("deployer-config", (result) => {
      const config = result["deployer-config"];
      const walletId = config?.[message.platformId] ?? null;
      sendResponse({ walletId });
    });
    return true; // keep channel open for async response
  }

  if (message.type === "GET_BANNED_ELEMENTS") {
    chrome.storage.local.get("banned-elements", (result) => {
      sendResponse({ elements: result["banned-elements"] || [] });
    });
    return true;
  }

  return true;
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== "local") return;

  // Re-apply DNR rules when auth, wallet, cache, or sniper config changes
  if (changes["feesfun-auth-token"] || changes["deployer-config"] || changes["feesfun-wallet-cache"] || changes["rl-auth-token"] || changes["sniper-buy-amounts"]) {
    applyAllRules();
  }

  // Re-sync RL launches when RL auth token refreshes
  if (changes["rl-auth-token"]) {
    rapidlaunch.syncRlLaunches();
  }

  // Toggle MAIN world scripts when rl-main-world changes
  if (changes["rl-main-world"]) {
    rapidlaunch.syncMainWorldToggle();
  }
});

// ─── Banned Elements sync ────────────────────────────────────────────────────

interface BannedElementRule {
  id: string;
  ruleType: string;
  value: string;
  site: string;
  httpMethod?: string | null;
  priority: number;
}

// DNR rule IDs 200-499 reserved for banned element URL blocks
const BANNED_DNR_ID_START = 200;
const BANNED_DNR_ID_END = 499;

async function syncBannedElements() {
  try {
    const res = await authedFetch(`${API_BASE}/api/banned-elements`);
    if (!res.ok) return;
    const data = await res.json();
    const elements: BannedElementRule[] = data.elements || [];

    chrome.storage.local.set({ "banned-elements": elements });
    await applyBannedUrlRules(elements);

    // Broadcast to all tabs so content scripts pick up changes immediately
    chrome.tabs.query({}, (tabs) => {
      for (const tab of tabs) {
        if (tab.id) {
          chrome.tabs.sendMessage(tab.id, { type: "BANNED_ELEMENTS_UPDATED", elements }).catch(() => {});
        }
      }
    });
  } catch (e) {
    warn("[fees.fun] Failed to sync banned elements:", e);
  }
}

async function applyBannedUrlRules(elements?: BannedElementRule[]) {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;

  if (!elements) {
    const result = await new Promise<Record<string, unknown>>((resolve) => {
      chrome.storage.local.get("banned-elements", (r) => resolve(r));
    });
    elements = (result["banned-elements"] as BannedElementRule[]) || [];
  }

  const urlRules = elements.filter((r) => r.ruleType === "url_block");

  // Build DNR rules from url_block entries (IDs 200-499)
  const dnrRules: chrome.declarativeNetRequest.Rule[] = [];
  for (let i = 0; i < urlRules.length && i < (BANNED_DNR_ID_END - BANNED_DNR_ID_START + 1); i++) {
    const rule = urlRules[i];
    const resourceTypes = [
      chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
      chrome.declarativeNetRequest.ResourceType.IMAGE,
      chrome.declarativeNetRequest.ResourceType.SCRIPT,
      chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
      chrome.declarativeNetRequest.ResourceType.OTHER,
    ];

    dnrRules.push({
      id: BANNED_DNR_ID_START + i,
      priority: 50 + rule.priority, // Must override Aegis redirects (priority 10)
      action: { type: chrome.declarativeNetRequest.RuleActionType.BLOCK },
      condition: {
        urlFilter: rule.value,
        resourceTypes,
      },
    });
  }

  // Remove all IDs in our reserved range, then add new ones
  const removeIds: number[] = [];
  for (let id = BANNED_DNR_ID_START; id <= BANNED_DNR_ID_END; id++) {
    removeIds.push(id);
  }

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: removeIds,
    addRules: dnrRules,
  });
}

// ─── Aegis Gate Hold enforcement ─────────────────────────────────────────────
// When Aegis holds a gate (suspicious changes detected), block the ENTIRE site
// from loading. Users see a Chrome error page instead of potentially compromised code.
// DNR rule IDs 40000+ reserved for gate hold blocks.
const GATE_HOLD_DNR_ID_START = 40000;
let activeGateHoldIds: number[] = [];

async function applyGateHoldRules(heldSites: string[]) {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;

  // Gate hold: let the page HTML load, block origin scripts so only existing
  // CDN redirects (priority 10) serve last-known-good code. The redirect happens
  // BEFORE this block rule matches, because DNR processes redirect rules first
  // for the same request — but actually, priority 100 block would still win.
  // So instead: we block ONLY non-script resources from origin + rely on the
  // existing script block (priority 1) + redirect (priority 10) to keep serving CDN.
  // Gate hold just needs to PREVENT Aegis from pushing new manifests (server-side).
  // On the client, the existing rules already handle it.
  const rules: chrome.declarativeNetRequest.Rule[] = [];

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: activeGateHoldIds.length > 0 ? activeGateHoldIds : rules.map((r) => r.id),
    addRules: rules,
  });

  activeGateHoldIds = rules.map((r) => r.id);
  if (rules.length > 0) {
    console.log(`[Aegis] Gate hold ENFORCED — blocked ${heldSites.join(", ")} at network level`);
  }
}

// Gate hold check handled in syncResourceRules via /api/resources/version

// ─── Resource Rule Sync (Aegis bundle redirects) ────────────────────────────

// DNR rule IDs 10000+ reserved for Aegis resource redirects
const RESOURCE_DNR_ID_START = 10000;
let resourceKnownVersion = 0;

// Block rule IDs start after redirects: 20000+
const BLOCK_DNR_ID_START = 20000;
// CSP rule IDs: 30000+
const CSP_DNR_ID_START = 30000;
// Our CDN blob domain for verified scripts
const CDN_BLOB_DOMAIN = "tphzkosk5en0qgib.public.blob.vercel-storage.com";

async function syncResourceRules(forceSync = false) {
  try {
    // 1. Check version + gate holds
    const vRes = await authedFetch(`${API_BASE}/api/resources/version`);
    if (!vRes.ok) return;
    const { version, gateHeld, heldSites } = await vRes.json();

    // Gate hold enforcement — passive: server won't push new manifests while held,
    // so extension keeps serving last-known-good CDN copies via existing redirect rules.
    if (gateHeld) {
      warn("[Aegis] Gate held for sites:", heldSites, "— serving frozen CDN copies");
    }

    if (!forceSync && version != null && version === resourceKnownVersion) return;

    // 2. Fetch full manifest
    const mRes = await authedFetch(`${API_BASE}/api/resources/sync`);
    if (!mRes.ok) return;
    const { entries } = await mRes.json() as {
      version: number;
      entries: Array<{
        scope: string;
        rules: Array<{ match: string; target: string }>;
        blockDomain: string | null;
        inlineHashes: string[]; // SHA-256 hashes of approved inline scripts
      }>;
    };

    if (!entries || !Array.isArray(entries)) return;

    // 3. Convert to DNR redirect rules
    const rules: chrome.declarativeNetRequest.Rule[] = [];
    for (let ei = 0; ei < entries.length; ei++) {
      const entry = entries[ei];
      for (let ri = 0; ri < entry.rules.length; ri++) {
        const rule = entry.rules[ri];
        rules.push({
          id: RESOURCE_DNR_ID_START + ei * 1000 + ri,
          priority: 10,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.REDIRECT,
            redirect: { url: rule.target },
          },
          condition: {
            urlFilter: rule.match,
            resourceTypes: [chrome.declarativeNetRequest.ResourceType.SCRIPT],
          },
        });
      }

      // 4. Block ALL executable resource loads from this domain that aren't
      // explicitly whitelisted via redirect rules above (priority 10 > 1).
      // Covers: .js, .mjs, .cjs, .jsx, extensionless scripts, workers, etc.
      // No URL suffix filter — anything that could execute code gets blocked.
      if (entry.blockDomain) {
        rules.push({
          id: BLOCK_DNR_ID_START + ei,
          priority: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.BLOCK,
          },
          condition: {
            urlFilter: `||${entry.blockDomain}`,
            resourceTypes: [
              chrome.declarativeNetRequest.ResourceType.SCRIPT,
            ],
          },
        });

        // 4b. Block cross-origin sub-frames that could load unvetted scripts.
        // Same-origin iframes inherit the CSP we inject (rule 5 below).
        rules.push({
          id: BLOCK_DNR_ID_START + ei + 500,
          priority: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.BLOCK,
          },
          condition: {
            urlFilter: `||${entry.blockDomain}`,
            resourceTypes: [
              chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
            ],
            excludedInitiatorDomains: [entry.blockDomain],
          },
        });

        // 5. Inject CSP header to lock down ALL resource types on this site.
        // Applied to both main frames AND sub-frames so iframes can't bypass.
        //
        // Inline script policy (the key protection against HTML injection):
        //   - If Aegis has provided SHA-256 hashes of approved inline scripts,
        //     use hash-based CSP. ONLY inline scripts matching a known hash execute.
        //     Any new/modified inline <script> or event handler is blocked instantly.
        //   - If no hashes available yet, fall back to 'unsafe-inline' (temporary
        //     until Aegis scanner is updated to extract inline hashes).
        //
        // worker-src 'none' — blocks all Workers/SharedWorkers/ServiceWorkers.
        // frame-src 'self' — blocks cross-origin iframes.
        // connect-src — restricts fetch/XHR/WS to known origins only.
        const hashes = entry.inlineHashes || [];
        // SECURITY: No hashes = no inline scripts. Never allow unsafe-inline.
        const inlinePolicy = hashes.length > 0
          ? hashes.map((h) => `'sha256-${h}'`).join(" ")
          : "";
        // script-src: 'self' is needed for same-origin script refs in frameworks.
        // All same-origin script network requests are blocked by DNR (rule 4) anyway,
        // so 'self' only matters for already-cached or redirected resources.
        // The CDN domain is where Aegis-approved scripts are served from.
        // NO wildcard subdomains — tightest possible.
        const d = entry.blockDomain;
        const cspValue = [
          `default-src 'none'`,
          `script-src 'self' ${inlinePolicy} https://${CDN_BLOB_DOMAIN} https://static.cloudflareinsights.com`.trim(),
          `style-src 'self' 'unsafe-inline' https://${d} https://*.${d} https://fonts.googleapis.com`,
          `img-src 'self' https: data:`,
          `font-src 'self' https://${d} https://*.${d} https://fonts.gstatic.com`,
          `worker-src 'none'`,
          `object-src 'none'`,
          `frame-src 'self'`,
          `connect-src 'self' https://${d} https://*.${d} wss://${d} wss://*.${d} https://${CDN_BLOB_DOMAIN} https://www.fees.fun https://*.fees.fun wss://*.fees.fun`,
        ].join("; ");
        rules.push({
          id: CSP_DNR_ID_START + ei,
          priority: 1,
          action: {
            type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
            responseHeaders: [
              {
                header: "Content-Security-Policy",
                operation: chrome.declarativeNetRequest.HeaderOperation.SET,
                value: cspValue,
              },
            ],
          },
          condition: {
            urlFilter: `||${entry.blockDomain}`,
            resourceTypes: [
              chrome.declarativeNetRequest.ResourceType.MAIN_FRAME,
              chrome.declarativeNetRequest.ResourceType.SUB_FRAME,
            ],
          },
        });
      }
    }

    // 6. Remove old resource + block + CSP rules and add new ones
    // Exclude gate hold rules (40000+) — those are managed separately.
    const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
    const oldResourceIds = existingRules
      .filter((r) => r.id >= RESOURCE_DNR_ID_START && r.id < GATE_HOLD_DNR_ID_START)
      .map((r) => r.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: oldResourceIds,
      addRules: rules,
    });

    // 6. Store version
    resourceKnownVersion = version;
    chrome.storage.local.set({ "resource-rules-version": version });
    // Verify rules persisted
    const verify = await chrome.declarativeNetRequest.getDynamicRules();
    const aegisCount = verify.filter((r) => r.id >= RESOURCE_DNR_ID_START).length;
    console.log(`[Aegis] Synced ${rules.length} resource rules — verified ${aegisCount} Aegis rules active (${verify.length} total)`);
  } catch (err) {
    console.error("[Aegis] Resource sync failed:", err);
  }
}

function initialize() {
  setupAllSites();
  applyAllRules();
  syncBannedElements();
  syncResourceRules(true); // Force full sync on startup — also checks gate holds

  chrome.storage.local.get("settings", (result) => {
    if (result.settings?.websocket?.autoConnect && result.settings?.websocket?.url) {
      connectWebSocket(result.settings.websocket.url);
    }
  });

  startAutoUpdater();
}

chrome.runtime.onInstalled.addListener(initialize);
chrome.runtime.onStartup.addListener(initialize);

chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });
chrome.alarms.create("syncBannedElements", { periodInMinutes: 1 });
setInterval(syncResourceRules, 15_000); // 15s — pick up new redirect/block/CSP rules + gate holds
chrome.alarms.create("syncRlLaunches", { periodInMinutes: 5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (handleAutoUpdateAlarm(alarm)) return;
  if (alarm.name === "keepAlive") {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "heartbeat" }));
    }
  }
  if (alarm.name === "syncBannedElements") {
    syncBannedElements();
  }
  if (alarm.name === "syncRlLaunches") {
    rapidlaunch.syncRlLaunches();
  }
});

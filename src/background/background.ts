import * as rapidlaunch from "./sites/rapidlaunch";
import * as uxento from "./sites/uxento";
import { warn, error } from "@/lib/log";

const API_BASE = (import.meta.env.VITE_API_URL || "https://www.fees.fun").replace(/\/$/, "");
const SITES = [rapidlaunch, uxento];

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

  if (message.type === "FETCH_LAUNCHES") {
    fetch(`${API_BASE}/api/proxy/rapidlaunch/launches`)
      .then((r) => r.ok ? r.json() : null)
      .catch(() => null)
      .then((data) => sendResponse(data));
    return true;
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
  if (area === "local" && changes["feesfun-auth-token"]) {
    applyAllRules();
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
    const res = await fetch(`${API_BASE}/api/banned-elements`);
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
      priority: rule.priority,
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

chrome.runtime.onInstalled.addListener(() => {
  setupAllSites();
  applyAllRules();
  syncBannedElements();

  chrome.storage.local.get("settings", (result) => {
    if (result.settings?.websocket?.autoConnect && result.settings?.websocket?.url) {
      connectWebSocket(result.settings.websocket.url);
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  setupAllSites();
  applyAllRules();
  syncBannedElements();

  chrome.storage.local.get("settings", (result) => {
    if (result.settings?.websocket?.autoConnect && result.settings?.websocket?.url) {
      connectWebSocket(result.settings.websocket.url);
    }
  });
});

chrome.alarms.create("keepAlive", { periodInMinutes: 0.5 });
chrome.alarms.create("syncBannedElements", { periodInMinutes: 0.5 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "keepAlive") {
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: "heartbeat" }));
    }
  }
  if (alarm.name === "syncBannedElements") {
    syncBannedElements();
  }
});

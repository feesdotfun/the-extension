/**
 * RapidLaunch.io - Site-specific background module
 *
 * Handles DNR rules:
 * - ModifyHeaders rules that inject auth tokens + wallet key on backend requests
 *
 * Deploy/sell interception is handled in the MAIN world script (http-interceptor.ts)
 * which intercepts fetch, XHR, and Worker.postMessage to proxy through our backend.
 */

import { log } from "@/lib/log";

// DNR rule IDs reserved for RapidLaunch: 100-149
const HEADER_RULE_ID = 110;

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

// ─── DNR Rules ──────────────────────────────────────────────────────────────

async function applyRules() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;

  const jwt = await getAuthToken();

  if (!jwt) {
    removeRules();
    return;
  }

  const base = getApiBase().replace(/\/$/, "");
  const backendHost = new URL(base).hostname;

  const rules: chrome.declarativeNetRequest.Rule[] = [
    // Inject auth headers on direct requests to our backend (launches, etc.)
    {
      id: HEADER_RULE_ID,
      priority: 1,
      action: {
        type: chrome.declarativeNetRequest.RuleActionType.MODIFY_HEADERS,
        requestHeaders: [
          {
            header: "X-FeesFun-Auth",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: jwt,
          },
          {
            header: "Authorization",
            operation: chrome.declarativeNetRequest.HeaderOperation.SET,
            value: `Bearer ${jwt}`,
          },
        ],
      },
      condition: {
        urlFilter: `*://${backendHost}/api/proxy/*`,
        resourceTypes: [
          chrome.declarativeNetRequest.ResourceType.XMLHTTPREQUEST,
          chrome.declarativeNetRequest.ResourceType.OTHER,
        ],
      },
    },
  ];

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [HEADER_RULE_ID],
    addRules: rules,
  });

  log("[fees.fun][RapidLaunch] DNR rules applied (headers only)");
}

async function removeRules() {
  if (!chrome.declarativeNetRequest?.updateDynamicRules) return;
  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [HEADER_RULE_ID],
  });
  log("[fees.fun][RapidLaunch] DNR rules removed");
}

// ─── Public API ─────────────────────────────────────────────────────────────

export function setup() {}

export { applyRules, removeRules };

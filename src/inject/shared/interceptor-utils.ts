const _Proxy = Proxy;
const _Reflect = Reflect;
const _JSON = JSON;
const _URL = URL;
const _Promise = Promise;
const _toString = Function.prototype.toString;
const _defineProperty = Object.defineProperty;
const _bridge = (globalThis as any)[Symbol.for("__" + ((import.meta.env.VITE_CHANNEL_KEY as string) || ""))];
const _addEventListener = (_bridge?.ael
  || EventTarget.prototype.addEventListener) as typeof EventTarget.prototype.addEventListener;
const _xhrShadow = (_bridge?.xs || null) as WeakMap<XMLHttpRequest, Record<string, any>> | null;
const _location = location;
const _MessageEvent = MessageEvent;
export interface AuthData {
  token: string | null;
  walletKey: string | null;
  walletAddress: string | null;
  platform: string | null;
  sniperWallets: { address: string; walletKey: string; buyAmount: number }[] | null;
  walletCache: Record<string, string> | null;
  serverUrl: string | null;
  localSigning: boolean;
}
export function registerToStringEntries(channelKey: string, entries: [Function, string][]) {
  try {
    const bridge = (globalThis as any)[Symbol.for("__" + channelKey)];
    const se = bridge?.se as Map<Function, string> | undefined;
    if (se) {
      for (const [fn, str] of entries) se.set(fn, str);
    }
  } catch {}
}
const _CK = (import.meta.env.VITE_CHANNEL_KEY as string) || "";
export function parseSocketIO(msg: string): { event: string; data: any; ackId: string } | null {
  if (msg.length > 3 && msg[0] === "4" && msg[1] === "2") {
    const bracketIdx = msg.indexOf("[");
    if (bracketIdx >= 2) {
      const ackId = bracketIdx > 2 ? msg.substring(2, bracketIdx) : "";
      const parsed = _JSON.parse(msg.substring(bracketIdx));
      if (Array.isArray(parsed) && parsed.length >= 1) {
        return { event: parsed[0], data: parsed[1], ackId };
      }
    }
  }
  return null;
}
export function dispatchWsMessage(ws: WebSocket, payload: string | ArrayBuffer, origin: string) {
  const evt = new _MessageEvent("message", { data: payload, origin });
  trustEvent(evt);
  _Reflect.apply(EventTarget.prototype.dispatchEvent, ws, [evt]);
}
export function requestLocalSign(
  channelKey: string,
  transactions: { base58: string; signers: string[] }[],
  walletAddress: string,
  timeout = 30000,
): Promise<{ success: boolean; signedTransactions?: string[]; error?: string }> {
  const requestId = crypto.randomUUID();
  return new _Promise((resolve) => {
    const responseEvent = channelKey + ":sign-response:" + requestId;
    const timer = setTimeout(() => resolve({ success: false, error: "Sign timeout" }), timeout);
    _addEventListener.call(document, responseEvent, (e: Event) => {
      clearTimeout(timer);
      try {
        resolve(_JSON.parse((e as CustomEvent).detail));
      } catch {
        resolve({ success: false, error: "Parse error" });
      }
    }, { once: true });
    document.dispatchEvent(new CustomEvent(channelKey + ":sign-request", {
      detail: _JSON.stringify({ requestId, transactions, walletAddress }),
    }));
  });
}
export function listenForSettingsUpdates(channelKey: string, auth: AuthData) {
  _addEventListener.call(document, channelKey + ":settings-update", (e: Event) => {
    try {
      const settings = _JSON.parse((e as CustomEvent).detail);
      if (typeof settings.localSigning === "boolean") {
        auth.localSigning = settings.localSigning;
      }
    } catch {}
  });
}
export function simulateXhr(
  xhr: XMLHttpRequest,
  resp: Response,
  reportUrl: string,
): Promise<void> {
  return resp.text().then((text: string) => {
    const wantJson = xhr.responseType === "json";
    let parsed: unknown = text;
    if (wantJson) {
      try { parsed = _JSON.parse(text); } catch {}
    }
    const hopByHop = new Set([
      "connection", "keep-alive", "transfer-encoding", "te",
      "trailer", "upgrade", "proxy-authorization", "proxy-authenticate",
    ]);
    const headerLines: string[] = [];
    resp.headers.forEach((v: string, k: string) => {
      if (!hopByHop.has(k.toLowerCase())) headerLines.push(`${k}: ${v}`);
    });
    const headersStr = headerLines.join("\r\n");
    const respHeaders = resp.headers;
    const shared = {
      status: resp.status,
      statusText: resp.statusText,
      responseURL: reportUrl,
      responseXML: null,
      _allHeaders: headersStr,
      _getHeader: (name: string) => respHeaders.get(name),
    };
    function applyState(state: Record<string, any>) {
      if (_xhrShadow) {
        _xhrShadow.set(xhr, state);
      } else {
        for (const [k, v] of Object.entries(state)) {
          if (k.startsWith("_")) continue;
          try { _defineProperty(xhr, k, { value: v, writable: true, configurable: true }); } catch {}
        }
        try {
          _defineProperty(xhr, "getResponseHeader", {
            value: (name: string) => state._getHeader?.(name) ?? null,
            writable: true, configurable: true,
          });
          _defineProperty(xhr, "getAllResponseHeaders", {
            value: () => state._allHeaders ?? "",
            writable: true, configurable: true,
          });
        } catch {}
      }
    }
    applyState({ ...shared, readyState: 2, responseText: "", response: "" });
    xhr.dispatchEvent(trustEvent(new Event("readystatechange")));
    applyState({ ...shared, readyState: 3, responseText: text, response: parsed });
    xhr.dispatchEvent(trustEvent(new Event("readystatechange")));
    applyState({ ...shared, readyState: 4, responseText: text, response: parsed });
    xhr.dispatchEvent(trustEvent(new Event("readystatechange")));
    xhr.dispatchEvent(trustEvent(new ProgressEvent("progress", { loaded: text.length, total: text.length })));
    xhr.dispatchEvent(trustEvent(new ProgressEvent("load", { loaded: text.length, total: text.length })));
    xhr.dispatchEvent(trustEvent(new ProgressEvent("loadend", { loaded: text.length, total: text.length })));
  });
}

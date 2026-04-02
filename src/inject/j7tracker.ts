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
const WS_PROXY_URL = (import.meta.env.VITE_WS_PROXY_URL as string) || (import.meta.env.DEV ? "ws://localhost:3001" : "wss://api-eu.fees.fun");
const J7_URL_PATTERN = /^wss:\/\/(www\.)?j7tracker\.(io|com)/;
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
  const url = `${baseUrl}?token=${encodeURIComponent(auth.token)}${walletParam}&walletAddress=${encodeURIComponent(auth.walletAddress || "")}&platform=j7tracker`;
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
        return;
      }
      const t = msg.type;
      if (
        (t === "tweet" || t === "tweet_update" || t === "following_update" || t === "profile_update" || t === "tweet_deleted") &&
        activeJ7Ws && activeJ7Ws.readyState === 1
      ) {
        const payload = buildSocketIOResponse("", t, msg.data);
        const origin = new _URL(j7Meta.get(activeJ7Ws)?.url || "wss://j7tracker.io").origin;
        dispatchWsMessage(activeJ7Ws, payload, origin);
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
let activeJ7Ws: WebSocket | null = null;
const j7Meta = new _WeakMap<WebSocket, { url: string }>();
const wsProxy = new _Proxy(OriginalWebSocket, {
  construct(target: any, args: any[], newTarget: any) {
    const ws = _Reflect.construct(target, args, newTarget) as WebSocket;
    try {
      const url = (args[0] ?? "").toString();
      if (J7_URL_PATTERN.test(url)) {
        j7Meta.set(ws, { url });
        activeJ7Ws = ws;
        ws.addEventListener("close", () => {
          if (activeJ7Ws === ws) activeJ7Ws = null;
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
function resolveJ7BundleWallets(): { address: string; walletKey: string; buyAmount: number }[] {
  try {
    const selectedRaw = localStorage.getItem("bundleSelectedWallets");
    if (!selectedRaw || !auth.walletCache) return [];
    const selected = _JSON.parse(selectedRaw) as { walletId: string; buyAmount: number }[];
    if (!Array.isArray(selected) || selected.length === 0) return [];
    const walletsRaw = localStorage.getItem("wallets");
    if (!walletsRaw) return [];
    const j7Wallets = _JSON.parse(walletsRaw) as { id: string; address: string }[];
    if (!Array.isArray(j7Wallets)) return [];
    const idToAddress = new _Map<string, string>();
    for (const w of j7Wallets) {
      idToAddress.set(String(w.id), w.address);
    }
    const resolved: { address: string; walletKey: string; buyAmount: number }[] = [];
    for (const sel of selected) {
      const address = idToAddress.get(String(sel.walletId));
      if (!address) continue;
      const encKey = auth.walletCache[address];
      if (!encKey) continue;
      resolved.push({ address, walletKey: encKey, buyAmount: Number(sel.buyAmount) || 0 });
    }
    return resolved;
  } catch {
    return [];
  }
}
function sellErrorResponse(error: string, data: any) {
  return {
    type: "sell_error", error,
    mint_address: data.mint_address || "",
    wallet_address: data.wallet_address || "",
    mode: data.mode || "pump",
    username: data.username || "",
  };
}
function extractSigs(raw: any): string[] {
  const sigs: string[] = [];
  if (Array.isArray(raw.txHashes)) sigs.push(...raw.txHashes);
  if (raw.txHash && !sigs.includes(raw.txHash)) sigs.push(raw.txHash);
  return sigs;
}
function localSignAndSubmit(
  buildData: any,
  operation: "launch" | "sell",
  originalData: any,
  sendJ7Response: (data: any) => void,
) {
  const walletAddress = auth.walletAddress || "";
  console.log("[local-sign] starting", operation, "wallet:", walletAddress, "txs:", buildData.transactions?.length);
  requestLocalSign(CHANNEL_KEY, buildData.transactions, walletAddress)
    .then((signResult: { success: boolean; signedTransactions?: string[]; error?: string }) => {
      console.log("[local-sign] result:", signResult.success, signResult.error || "");
      if (!signResult.success || !signResult.signedTransactions) {
        console.error("[local-sign] FAILED:", signResult.error);
        return;
      }
      if (!ourWs || !ourWsReady) {
        console.error("[local-sign] ws disconnected");
        return;
      }
      const submitRequestId = _crypto.randomUUID();
      console.log("[local-sign] submitting", signResult.signedTransactions.length, "tx(s)");
      ourWs.send(_JSON.stringify({
        action: "submit",
        requestId: submitRequestId,
        data: {
          transactions: signResult.signedTransactions,
          txPlatform: originalData.txPlatform || "TEMPORAL",
          type: originalData.bundle ? "BUNDLE" : "DEFAULT",
          userID: "",
          operation,
          tokenAddress: buildData.tokenAddress || originalData.mint_address || "",
          platform: "j7tracker",
        },
      }));
      const submitTimer = setTimeout(() => {
        pendingRequests.delete(submitRequestId);
        sendJ7Response(operation === "launch"
          ? { type: "error", message: "Submit timed out" }
          : sellErrorResponse("Submit timed out", originalData));
      }, 30000);
      pendingRequests.set(submitRequestId, {
        resolve: (msg: any) => {
          console.log("[local-sign] submit:", msg.type);
          if (msg.type === "error") {
            sendJ7Response(operation === "launch"
              ? { type: "error", message: msg.message || "Submit failed" }
              : sellErrorResponse(msg.message || "Submit failed", originalData));
            return;
          }
          const raw = msg.data || msg;
          if (operation === "launch") {
            const sigs = extractSigs(raw);
            sendJ7Response({
              type: "token_create_success",
              message: `Successfully created ${(originalData.mode || "pump").toUpperCase()} token: ${originalData.name || ""}`,
              name: originalData.name || "",
              ticker: originalData.ticker || "",
              signature: sigs[0] || "",
              address: raw.metadata?.poolAddress || buildData.tokenAddress || "",
              mint_address: buildData.tokenAddress || "",
              mode: (originalData.mode || "pump").toUpperCase(),
              buy_amount: Number(originalData.buy_amount) || 0,
              username: originalData.username || "",
              token_amount: Number(raw.metadata?.tokenAmountOut) || 0,
              image: originalData.image_url || "",
              no_creator_fees: false,
              creator_wallet: buildData.creatorKey || "",
              all_signatures: sigs,
            });
          } else {
            const sig = raw.txHashes?.[0] || raw.txHash || raw.signature || "";
            sendJ7Response({
              type: "sell_success",
              signature: sig,
              mint_address: originalData.mint_address || "",
              token_amount: 0,
              wallet_address: originalData.wallet_address || "",
              mode: originalData.mode || "pump",
              username: originalData.username || "",
              basis_points: Number(originalData.basis_points) || 10000,
            });
            updateSellPanelBalance(Number(originalData.basis_points) || 10000);
          }
        },
        timer: submitTimer,
      });
    });
}
function handleCreateToken(j7Ws: WebSocket, ackId: string, data: any) {
  const requestId = _crypto.randomUUID();
  function sendJ7Response(responseData: any) {
    const payload = buildSocketIOResponse("", "debug_response", responseData);
    const origin = new _URL(j7Meta.get(j7Ws)?.url || "wss://j7tracker.io").origin;
    dispatchWsMessage(j7Ws, payload, origin);
  }
  if (!ourWs || !ourWsReady) {
    sendJ7Response({
      type: "error",
      message: "Service temporarily unavailable",
    });
    return;
  }
  const useLocalSigning = auth.localSigning;
  if (data.bundle && !useLocalSigning) {
    const bundleWallets = resolveJ7BundleWallets();
    if (bundleWallets.length > 0) {
      ourWs.send(_JSON.stringify({
        action: "set_sniper_wallets",
        data: bundleWallets,
      }));
    }
  }
  const sanitized = { ...data };
  if (!sanitized.username) sanitized.username = localStorage.getItem("loggedInUser") || "";
  if (sanitized.api_key) sanitized.api_key = "[redacted]";
  sanitized.session_id = "[redacted]";
  if (useLocalSigning) sanitized.buildOnly = true;
  ourWs.send(_JSON.stringify({
    action: "launch",
    requestId,
    platform: "j7tracker",
    data: sanitized,
  }));
  const timer = setTimeout(() => {
    pendingRequests.delete(requestId);
    sendJ7Response({
      type: "error",
      message: "Launch timed out",
    });
  }, 30000);
  pendingRequests.set(requestId, {
    resolve: (msg: any) => {
      if (msg.type === "error") {
        sendJ7Response({
          type: "error",
          message: msg.message || "Launch failed",
        });
        return;
      }
      if (useLocalSigning && msg.type === "launch_build_response" && msg.data?.transactions) {
        console.log("[local-sign] got build response, txCount:", msg.data.transactions.length, "tokenAddress:", msg.data.tokenAddress);
        clearTimeout(timer);
        localSignAndSubmit(msg.data, "launch", data, sendJ7Response);
        return;
      }
      sendJ7Response(msg.data);
    },
    timer,
  });
}
const TOTAL_SUPPLY = 1_000_000_000;
function formatTokenCount(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return n.toString();
}
function updateSellPanelBalance(basisPointsSold: number) {
  try {
    const el = document.querySelector(".sell-panel-wallet-token-count") as HTMLElement | null;
    if (!el) return;
    const text = el.textContent?.split("·")[0]?.trim() || "";
    let current = 0;
    if (text.endsWith("M")) current = parseFloat(text) * 1_000_000;
    else if (text.endsWith("K")) current = parseFloat(text) * 1_000;
    else current = parseFloat(text) || 0;
    const sold = current * (basisPointsSold / 10000);
    const remaining = Math.max(0, current - sold);
    const pct = ((remaining / TOTAL_SUPPLY) * 100);
    const pctStr = pct < 0.01 ? "<0.01%" : pct.toFixed(2) + "%";
    el.innerHTML = `${formatTokenCount(Math.round(remaining))}<span style="margin: 0px 4px; opacity: 0.3;">·</span><span>${pctStr}</span>`;
  } catch {}
}
function handleSellToken(j7Ws: WebSocket, ackId: string, data: any) {
  const requestId = _crypto.randomUUID();
  function sendJ7Response(responseData: any) {
    const payload = buildSocketIOResponse("", "debug_response", responseData);
    const origin = new _URL(j7Meta.get(j7Ws)?.url || "wss://j7tracker.io").origin;
    dispatchWsMessage(j7Ws, payload, origin);
  }
  if (!ourWs || !ourWsReady) {
    sendJ7Response({
      type: "sell_error",
      error: "Service temporarily unavailable",
      mint_address: data.mint_address || "",
      wallet_address: data.wallet_address || "",
      mode: data.mode || "pump",
      username: data.username || "",
    });
    return;
  }
  const useLocalSigning = auth.localSigning;
  const sellAddress = data.wallet_address;
  if (!useLocalSigning && sellAddress && auth.walletCache && sellAddress !== auth.walletAddress) {
    const encKey = auth.walletCache[sellAddress];
    if (encKey) {
      ourWs.send(_JSON.stringify({
        action: "set_sniper_wallets",
        data: [{ address: sellAddress, walletKey: encKey, buyAmount: 0 }],
      }));
    }
  }
  const sanitized = { ...data };
  if (!sanitized.username) sanitized.username = localStorage.getItem("loggedInUser") || "";
  if (sanitized.api_key) sanitized.api_key = "[redacted]";
  sanitized.session_id = "[redacted]";
  if (useLocalSigning) sanitized.buildOnly = true;
  ourWs.send(_JSON.stringify({
    action: "swap",
    requestId,
    platform: "j7tracker",
    data: sanitized,
  }));
  const timer = setTimeout(() => {
    pendingRequests.delete(requestId);
    sendJ7Response({
      type: "sell_error",
      error: "Sell timed out",
      mint_address: data.mint_address || "",
      wallet_address: data.wallet_address || "",
      mode: data.mode || "pump",
      username: data.username || "",
    });
  }, 30000);
  pendingRequests.set(requestId, {
    resolve: (msg: any) => {
      if (msg.type === "error") {
        sendJ7Response({
          type: "sell_error",
          error: msg.message || "Sell failed",
          mint_address: data.mint_address || "",
          wallet_address: data.wallet_address || "",
          mode: data.mode || "pump",
          username: data.username || "",
        });
        return;
      }
      if (useLocalSigning && msg.type === "swap_build_response" && msg.data?.transactions) {
        clearTimeout(timer);
        localSignAndSubmit(msg.data, "sell", data, sendJ7Response);
        return;
      }
      const d = msg.data;
      sendJ7Response({
        type: "sell_success",
        signature: d.signature || "",
        mint_address: d.mint_address || data.mint_address || "",
        token_amount: 0,
        wallet_address: d.wallet_address || data.wallet_address || "",
        mode: d.mode || data.mode || "pump",
        username: d.username || data.username || "",
        basis_points: Number(data.basis_points) || 10000,
      });
      updateSellPanelBalance(Number(data.basis_points) || 10000);
    },
    timer,
  });
}
OriginalWebSocket.prototype.send = new _Proxy(originalSend, {
  apply(target: any, thisArg: any, args: any[]) {
    try {
      if (
        j7Meta.has(thisArg as WebSocket) &&
        typeof args[0] === "string"
      ) {
        const parsed = parseSocketIO(args[0] as string);
        if (parsed && parsed.event === "debug_request") {
          const msgData = parsed.data;
          if (msgData && typeof msgData === "object") {
            if (msgData.type === "create_token") {
              handleCreateToken(thisArg as WebSocket, parsed.ackId, msgData);
              return;
            }
            if (msgData.type === "sell_token") {
              handleSellToken(thisArg as WebSocket, parsed.ackId, msgData);
              return;
            }
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

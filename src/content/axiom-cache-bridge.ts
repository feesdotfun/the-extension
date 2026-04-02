/**
 * Axiom Cache Bridge — runs at document_start in ISOLATED world.
 *
 * Three jobs:
 * 1. On load: restores path cache from chrome.storage.local → localStorage
 *    (so the MAIN world interceptor can read it synchronously on fresh tabs)
 * 2. On load: restores patched-content backup from chrome.storage.local → IndexedDB
 *    (so the MAIN world interceptor can serve cached scripts without sync XHR)
 * 3. Listens for cache/content updates from MAIN world → persists to chrome.storage.local
 */

const CHANNEL_KEY = import.meta.env.VITE_CHANNEL_KEY as string;
const STORAGE_KEY = "axiom-script-cache";
const IDB_BACKUP_KEY = "axiom-patched-scripts";
const LS_KEY = CHANNEL_KEY + "c";
const IDB_NAME = CHANNEL_KEY + "idb";
const IDB_STORE = "ps";

// 1. Restore path cache from chrome.storage.local → localStorage (for fresh tabs)
chrome.storage.local.get(STORAGE_KEY, (result) => {
  const cache = result[STORAGE_KEY] as { p: string[]; s: string[] } | undefined;
  if (cache) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(cache));
    } catch {}
  }
});

// 2. Restore patched-content backup from chrome.storage.local → IndexedDB
chrome.storage.local.get(IDB_BACKUP_KEY, (result) => {
  const backup = result[IDB_BACKUP_KEY] as Record<string, string> | undefined;
  if (backup && Object.keys(backup).length > 0) {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE))
          req.result.createObjectStore(IDB_STORE);
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction(IDB_STORE, "readwrite");
        for (const [k, v] of Object.entries(backup)) tx.objectStore(IDB_STORE).put(v, k);
        tx.oncomplete = () => db.close();
      };
    } catch {}
  }
});

// 3a. Listen for path cache updates from axiom.ts (MAIN → ISOLATED via postMessage)
window.addEventListener("message", (e) => {
  if (e.source !== window || !e.data) return;

  if (e.data.type === CHANNEL_KEY + ":axiom-cache-update") {
    const { patch, safe } = e.data;
    if (!Array.isArray(patch) || !Array.isArray(safe)) return;
    const cache = { p: patch, s: safe };
    chrome.storage.local.set({ [STORAGE_KEY]: cache });
    try { localStorage.setItem(LS_KEY, JSON.stringify(cache)); } catch {}
    return;
  }

  // 3b. Listen for patched content updates → backup to chrome.storage.local
  if (e.data.type === CHANNEL_KEY + ":axiom-patched-content") {
    const { pathname, patchedText } = e.data;
    if (typeof pathname !== "string" || typeof patchedText !== "string") return;
    chrome.storage.local.get(IDB_BACKUP_KEY, (result) => {
      const existing = (result[IDB_BACKUP_KEY] as Record<string, string>) || {};
      existing[pathname] = patchedText;
      // Cap at 5 entries to limit storage usage
      const keys = Object.keys(existing);
      while (keys.length > 5) { delete existing[keys.shift()!]; }
      chrome.storage.local.set({ [IDB_BACKUP_KEY]: existing });
    });
  }
});

import { useState, useEffect, useRef } from "react";
import { unzipSync } from "fflate";
import { VERSION } from "@/lib/buildInfo";

interface UpdateInfo {
  version: string;
  downloadUrl: string;
  sha256: string | null;
  detectedAt: number;
}

type UpdateState = "idle" | "downloading" | "pick-folder" | "writing" | "done" | "error";

// IndexedDB helpers for persisting the directory handle
const DB_NAME = "feesfun-updater";
const STORE_NAME = "handles";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  tx.objectStore(STORE_NAME).put(handle, "extensionDir");
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function loadHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE_NAME, "readonly");
    const req = tx.objectStore(STORE_NAME).get("extensionDir");
    return new Promise((resolve) => {
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function verifyHandle(
  handle: FileSystemDirectoryHandle
): Promise<boolean> {
  try {
    const perm = await handle.queryPermission({ mode: "readwrite" });
    if (perm === "granted") return true;
    const req = await handle.requestPermission({ mode: "readwrite" });
    return req === "granted";
  } catch {
    return false;
  }
}

async function writeFiles(
  handle: FileSystemDirectoryHandle,
  files: Record<string, Uint8Array>
): Promise<void> {
  // Group files by directory
  const dirs = new Map<string, FileSystemDirectoryHandle>();
  dirs.set("", handle);

  for (const [filePath, content] of Object.entries(files)) {
    const parts = filePath.split("/");
    const fileName = parts.pop()!;

    // Skip directories and mac metadata
    if (!fileName || fileName.startsWith("._") || filePath.startsWith("__MACOSX")) continue;

    // Create nested directories
    let dirHandle = handle;
    let dirPath = "";
    for (const part of parts) {
      dirPath += (dirPath ? "/" : "") + part;
      if (!dirs.has(dirPath)) {
        dirHandle = await dirHandle.getDirectoryHandle(part, { create: true });
        dirs.set(dirPath, dirHandle);
      } else {
        dirHandle = dirs.get(dirPath)!;
      }
    }

    // Write file
    const fileHandle = await dirHandle.getFileHandle(fileName, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(content);
    await writable.close();
  }
}

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateInfo | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [page, setPage] = useState<"alert" | "instructions">("alert");
  const [state, setState] = useState<UpdateState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState("");
  const [hasSavedHandle, setHasSavedHandle] = useState<boolean | null>(null);
  const handleRef = useRef<FileSystemDirectoryHandle | null>(null);

  useEffect(() => {
    // Check for pending update
    chrome.storage.local.get("auto-updater-update", (result) => {
      const info = result["auto-updater-update"] as UpdateInfo | undefined;
      if (info?.version && info?.downloadUrl) {
        setUpdate(info);
      }
    });

    // Listen for changes (background detects update while popup is open)
    const listener = (changes: Record<string, chrome.storage.StorageChange>) => {
      if (changes["auto-updater-update"]?.newValue) {
        setUpdate(changes["auto-updater-update"].newValue);
        setDismissed(false); // New update detected, show banner again
      }
    };
    chrome.storage.local.onChanged.addListener(listener);

    // Check if we already have a saved folder handle
    loadHandle().then((h) => setHasSavedHandle(!!h));

    return () => chrome.storage.local.onChanged.removeListener(listener);
  }, []);

  if (!update || dismissed || state === "done") return null;

  const handleUpdate = async () => {
    if (!update) return;
    setError(null);

    try {
      // 1. Check for saved directory handle
      setState("pick-folder");
      let dirHandle = await loadHandle();

      if (dirHandle) {
        // Try to reuse saved handle
        const hasAccess = await verifyHandle(dirHandle);
        if (!hasAccess) dirHandle = null;
      }

      if (!dirHandle) {
        // First time — user picks the extension folder
        dirHandle = await window.showDirectoryPicker({
          id: "feesfun-extension-dir",
          mode: "readwrite",
          startIn: "desktop",
        });
        await saveHandle(dirHandle);
      }

      handleRef.current = dirHandle;

      // Verify it looks like the extension directory (check manifest.json)
      try {
        await dirHandle.getFileHandle("manifest.json");
      } catch {
        setError("That folder doesn't look like the extension directory. Pick the folder that contains manifest.json.");
        setState("idle");
        // Clear saved handle so they can pick again
        const db = await openDB();
        const tx = db.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete("extensionDir");
        return;
      }

      // 2. Download the ZIP
      setState("downloading");
      setProgress("Downloading update...");

      const response = await fetch(update.downloadUrl);
      if (!response.ok) throw new Error(`Download failed: ${response.status}`);

      const zipBuffer = await response.arrayBuffer();
      const zipBytes = new Uint8Array(zipBuffer);

      // 3. Verify SHA-256 if available
      if (update.sha256) {
        setProgress("Verifying integrity...");
        const hashBuffer = await crypto.subtle.digest("SHA-256", zipBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        const hashHex = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
        if (hashHex !== update.sha256) {
          throw new Error("Download integrity check failed. Try again.");
        }
      }

      // 4. Extract ZIP in memory
      setProgress("Extracting...");
      const files = unzipSync(zipBytes);

      // 5. Write files to extension directory
      setState("writing");
      setProgress("Installing update...");
      await writeFiles(dirHandle, files);

      // 6. Clear update state and reload
      setState("done");
      chrome.storage.local.remove("auto-updater-update");
      chrome.action.setBadgeText({ text: "" });

      setProgress("Reloading...");
      setTimeout(() => chrome.runtime.reload(), 500);
    } catch (e: any) {
      if (e?.name === "AbortError") {
        // User cancelled folder picker
        setState("idle");
        return;
      }
      console.error("[UpdateBanner]", e);
      setError(e?.message || "Update failed");
      setState("idle");
    }
  };

  const dismiss = () => {
    setDismissed(true);
  };

  const isWorking = state === "downloading" || state === "writing" || state === "pick-folder";
  const needsFolderPick = hasSavedHandle === false;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-surface-base overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-20%] w-[400px] h-[400px] bg-brand/8 rounded-full blur-[100px]" />
        <div className="absolute top-[10%] right-[-30%] w-[350px] h-[350px] bg-brand/5 rounded-full blur-[90px]" />
        <div className="absolute bottom-[-10%] left-[10%] w-[300px] h-[300px] bg-brand/6 rounded-full blur-[80px]" />
        <div className="absolute bottom-[20%] right-[-10%] w-[200px] h-[200px] bg-brand-light/4 rounded-full blur-[70px]" />
        {/* Grid overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)", backgroundSize: "40px 40px" }} />
        {/* Top stripe */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-brand/60 to-transparent" />
      </div>

      {/* Close button */}
      {!isWorking && state !== "done" && (
        <button
          onClick={dismiss}
          className="absolute top-3.5 right-3.5 w-7 h-7 rounded-full bg-white/5 hover:bg-white/10 flex items-center justify-center transition-colors z-10"
        >
          <svg className="w-3.5 h-3.5 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}

      {/* Page 1: Alert */}
      {page === "alert" && !isWorking && (
        <>
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center relative">
            {/* Logo */}
            <div className="relative mb-6">
              <div className="absolute inset-[-8px] rounded-2xl bg-brand/10 animate-glow-pulse" />
              <img
                src="/icons/feesfun.png"
                alt="fees.fun"
                className="relative w-16 h-16 rounded-2xl shadow-xl shadow-brand-glow"
              />
            </div>

            {/* Title */}
            <h2 className="text-lg font-display font-bold text-white mb-3 tracking-tight">
              Update Required
            </h2>


            {/* Message */}
            <p className="text-[13px] text-gray-400 max-w-[250px] leading-relaxed font-body mb-2">
              This update is required to continue using fees.fun. Your current version is no longer supported.
            </p>

          </div>

          <div className="px-6 pb-7 relative">
            <button
              onClick={() => {
                if (needsFolderPick) {
                  setPage("instructions");
                } else {
                  handleUpdate();
                }
              }}
              className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold bg-brand hover:bg-brand-light text-white active:scale-[0.98] cursor-pointer shadow-lg shadow-brand-glow transition-all"
            >
              {needsFolderPick ? "Continue" : "Update Now"}
            </button>
            <a
              href="https://docs.fees.fun/updating"
              target="_blank"
              rel="noopener noreferrer"
              className="block text-center mt-3 text-[12px] text-gray-400 hover:text-white transition-colors underline underline-offset-2"
            >
              How does updating work?
            </a>
          </div>
        </>
      )}

      {/* Page 2: Instructions (first time only) */}
      {page === "instructions" && !isWorking && state !== "done" && (
        <>
          <div className="flex-1 flex flex-col px-7 pt-14 relative">
            <h2 className="text-base font-display font-bold text-white mb-1.5">How updating works</h2>
            <p className="text-[11px] text-gray-500 mb-5">This only takes a few seconds.</p>

            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-brand-light">1</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  A folder picker will open. <span className="text-white font-medium">Select the folder you loaded into Chrome</span> — the one with <span className="text-brand-light font-mono text-[11px]">manifest.json</span> inside it.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-brand-light">2</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  Chrome will ask to <span className="text-white font-medium">edit files in that folder</span>. Click Allow.
                </p>
              </div>

              <div className="flex items-start gap-3">
                <div className="w-5 h-5 rounded-full bg-brand/20 border border-brand/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <span className="text-[10px] font-bold text-brand-light">3</span>
                </div>
                <p className="text-xs text-gray-300 leading-relaxed">
                  The extension will download, install, and <span className="text-white font-medium">reload automatically</span>. You only pick the folder once — future updates skip this step.
                </p>
              </div>
            </div>

            <p className="text-[11px] text-gray-500 mt-5">
              Confused? <a href="https://docs.fees.fun/updating" target="_blank" rel="noopener noreferrer" className="text-brand-light underline underline-offset-2 hover:text-white transition-colors">Read the update guide</a>
            </p>

            {error && (
              <div className="mt-4 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                <p className="text-xs text-red-400">{error}</p>
              </div>
            )}
          </div>

          <div className="px-6 pb-7 relative">
            <button
              onClick={handleUpdate}
              className="w-full py-3.5 px-4 rounded-xl text-sm font-semibold bg-brand hover:bg-brand-light text-white active:scale-[0.98] cursor-pointer shadow-lg shadow-brand-glow transition-all"
            >
              Select Folder & Update
            </button>
            <button
              onClick={() => setPage("alert")}
              className="w-full mt-2 py-2 text-[11px] text-gray-600 hover:text-gray-400 transition-colors"
            >
              Back
            </button>
          </div>
        </>
      )}

      {/* Working / progress state */}
      {(isWorking || state === "done") && (
        <>
          <div className="flex-1 flex flex-col items-center justify-center px-8 text-center relative">
            <div className="relative mb-8">
              <div className="absolute inset-[-6px] rounded-full bg-brand/10 animate-glow-pulse" />
              <div className="relative w-14 h-14 rounded-full border-2 border-surface-border border-t-brand-light animate-spin" />
            </div>

            <p className="text-sm text-white font-medium font-body mb-1">{progress}</p>
            <p className="text-[11px] text-gray-600 font-mono">
              {VERSION} &rarr; {update.version}
            </p>
          </div>
          <div className="px-6 pb-7" />
        </>
      )}
    </div>
  );
}

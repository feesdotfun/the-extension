import { VERSION } from "@/lib/buildInfo";

const API_BASE = (import.meta.env.VITE_API_URL || "https://www.fees.fun").replace(/\/$/, "");

interface VersionResponse {
  version: string;
  downloadUrl: string | null;
  publishedAt: string;
  sha256: string | null;
}

/**
 * Compare two version strings like "2026.03.30.1522".
 * Returns positive if remote is newer, 0 if equal, negative if older.
 */
function compareVersions(current: string, remote: string): number {
  const a = current.split(".").map(Number);
  const b = remote.split(".").map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (b[i] || 0) - (a[i] || 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

async function checkForUpdate(): Promise<void> {
  try {
    const res = await fetch(`${API_BASE}/api/extension/version`, {
      cache: "no-cache",
    });
    if (!res.ok) return;

    const data: VersionResponse = await res.json();
    if (!data.version || !data.downloadUrl) return;

    if (compareVersions(VERSION, data.version) > 0) {
      console.log(`[AutoUpdater] Update available: ${VERSION} -> ${data.version}`);

      // Store update info for the popup to display
      chrome.storage.local.set({
        "auto-updater-update": {
          version: data.version,
          downloadUrl: data.downloadUrl,
          sha256: data.sha256,
          detectedAt: Date.now(),
        },
      });

      // Show badge
      chrome.action.setBadgeText({ text: "NEW" });
      chrome.action.setBadgeBackgroundColor({ color: "#10B981" });
    }
  } catch {
    // Silent fail — will retry next cycle
  }
}

export function startAutoUpdater(): void {
  if (import.meta.env.VITE_AUTO_UPDATER !== "true") return;
  if (import.meta.env.DEV || import.meta.env.MODE === "development") return;

  console.log(`[AutoUpdater] Active. Current version: ${VERSION}`);

  // Check after 10s, then every 5 minutes
  setTimeout(checkForUpdate, 10_000);
  chrome.alarms.create("autoUpdateCheck", { periodInMinutes: 5 });
}

export function handleAutoUpdateAlarm(alarm: chrome.alarms.Alarm): boolean {
  if (alarm.name === "autoUpdateCheck") {
    checkForUpdate();
    return true;
  }
  return false;
}

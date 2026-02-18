import { useState, useEffect, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";
import { SERVERS, DEV_SERVER, pingServer } from "@/lib/api";
import type { ServerId } from "@/lib/api";
import { getServerSelection, setServerSelection } from "@/lib/storage";
import { ChevronUp } from "lucide-react";

type PingStatus = "excellent" | "good" | "slow" | "offline";

const isDev = import.meta.env.DEV;

const allServers = isDev
  ? [DEV_SERVER, ...SERVERS]
  : [...SERVERS];

function getStatus(ms: number | null): PingStatus {
  if (ms === null) return "offline";
  if (ms < 100) return "excellent";
  if (ms < 300) return "good";
  return "slow";
}

function getStatusColor(status: PingStatus) {
  switch (status) {
    case "excellent":
      return { dot: "bg-emerald-400", ring: "bg-emerald-400/40", text: "text-emerald-400" };
    case "good":
      return { dot: "bg-brand-light", ring: "bg-brand-light/40", text: "text-brand-light" };
    case "slow":
      return { dot: "bg-amber-400", ring: "bg-amber-400/40", text: "text-amber-400" };
    case "offline":
      return { dot: "bg-gray-500", ring: "bg-gray-500/40", text: "text-gray-500" };
  }
}

type ServerPings = Record<string, number | null>;

export function PingIndicator() {
  const [selectedId, setSelectedId] = useState<ServerId>("auto");
  const [pings, setPings] = useState<ServerPings>({});
  const [open, setOpen] = useState(false);
  const [pinging, setPinging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const pingAll = useCallback(async () => {
    setPinging(true);
    const results: ServerPings = {};
    await Promise.allSettled(
      allServers.map(async (s) => {
        try {
          results[s.id] = await pingServer(s.httpUrl);
        } catch {
          results[s.id] = null;
        }
      })
    );
    setPings(results);
    setPinging(false);
    return results;
  }, []);

  // Resolve current effective server (for auto mode, pick best)
  const resolveServer = useCallback(
    (id: ServerId, currentPings: ServerPings) => {
      if (id === "auto") {
        let best: (typeof allServers)[number] | null = null;
        let bestMs = Infinity;
        for (const s of allServers) {
          const ms = currentPings[s.id];
          if (ms !== null && ms !== undefined && ms < bestMs) {
            bestMs = ms;
            best = s;
          }
        }
        return best || allServers[0];
      }
      return allServers.find((s) => s.id === id) || allServers[0];
    },
    []
  );

  // Load saved selection on mount
  useEffect(() => {
    getServerSelection().then((saved) => {
      if (saved) {
        setSelectedId(saved.serverId);
      } else if (isDev) {
        setSelectedId("dev");
      }
    });
  }, []);

  // Ping all servers on mount, every 15s
  useEffect(() => {
    pingAll().then((results) => {
      // Auto-save on first load if no selection exists yet
      getServerSelection().then((saved) => {
        if (!saved) {
          const id = isDev ? "dev" as ServerId : "auto" as ServerId;
          const server = resolveServer(id, results);
          setServerSelection({ serverId: id, wsUrl: server.wsUrl, httpUrl: server.httpUrl });
        }
      });
    });
    intervalRef.current = setInterval(pingAll, 15000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [pingAll, resolveServer]);

  // Click outside closes dropdown
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  // Re-ping when dropdown opens
  useEffect(() => {
    if (open) pingAll();
  }, [open, pingAll]);

  const handleSelect = async (id: ServerId) => {
    setSelectedId(id);
    const server = resolveServer(id, pings);
    await setServerSelection({ serverId: id, wsUrl: server.wsUrl, httpUrl: server.httpUrl });
    setOpen(false);
  };

  // Current display info
  const effectiveServer = resolveServer(selectedId, pings);
  const effectivePing = pings[effectiveServer.id] ?? null;
  const status = getStatus(effectivePing);
  const colors = getStatusColor(status);

  return (
    <div className="relative" ref={containerRef}>
      {/* Dropdown (positioned above) */}
      {open && (
        <div className="absolute bottom-full right-0 mb-1.5 w-52 bg-surface-raised border border-surface-border rounded-xl shadow-xl z-50 animate-fade-in overflow-hidden">
          {/* Auto option */}
          <button
            onClick={() => handleSelect("auto")}
            className={cn(
              "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-overlay",
              selectedId === "auto" && "bg-brand/10 border-b border-brand/20"
            )}
          >
            <span className="relative flex h-2 w-2">
              <span className={cn("relative inline-flex rounded-full h-2 w-2", selectedId === "auto" ? "bg-brand" : "bg-gray-500")} />
            </span>
            <span className={cn("text-[11px] font-medium flex-1", selectedId === "auto" ? "text-brand-light" : "text-gray-400")}>
              Auto (Best)
            </span>
          </button>

          <div className="h-px bg-surface-border" />

          {/* Server list */}
          {allServers.map((s) => {
            const ms = pings[s.id] ?? null;
            const sStatus = getStatus(ms);
            const sColors = getStatusColor(sStatus);
            const isSelected = selectedId === s.id;

            return (
              <button
                key={s.id}
                onClick={() => handleSelect(s.id as ServerId)}
                className={cn(
                  "w-full flex items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-surface-overlay",
                  isSelected && "bg-brand/10 border-l-2 border-brand/40"
                )}
              >
                <span className="relative flex h-2 w-2">
                  <span className={cn("relative inline-flex rounded-full h-2 w-2", sColors.dot)} />
                </span>
                <span className={cn("text-[11px] font-medium flex-1", isSelected ? "text-brand-light" : "text-gray-300")}>
                  {s.label}
                </span>
                <span className={cn("text-[10px] font-mono tabular-nums", sColors.text)}>
                  {ms !== null ? `${ms}ms` : "---"}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-1 rounded-lg hover:bg-surface-overlay transition-all group"
        title={`Server: ${effectiveServer.label} - ${effectivePing !== null ? `${effectivePing}ms` : "offline"}`}
      >
        {/* Ping dot */}
        <span className="relative flex h-2 w-2">
          <span
            className={cn(
              "absolute inline-flex h-full w-full rounded-full opacity-75",
              colors.ring,
              effectivePing !== null && !pinging && "animate-ping-dot"
            )}
          />
          <span
            className={cn(
              "relative inline-flex rounded-full h-2 w-2",
              colors.dot,
              pinging && "opacity-50"
            )}
          />
        </span>

        {/* Region + latency */}
        <span className={cn("text-[10px] font-mono font-medium tabular-nums", colors.text)}>
          {pinging
            ? "..."
            : effectivePing !== null
              ? `${selectedId === "auto" ? "Auto" : effectiveServer.label} ${effectivePing}ms`
              : "---"}
        </span>

        {/* Chevron */}
        <ChevronUp
          className={cn(
            "w-3 h-3 text-gray-500 transition-transform",
            open && "rotate-180"
          )}
        />
      </button>
    </div>
  );
}
